import logging
import threading
import time
from datetime import timedelta

from django.utils.timezone import now

from apps.predictions.models import Prediction
from apps.sensor_ingest.models import SensorReading
from apps.settings_manager.models import SystemSetting
from apps.whatsapp_integration.models import (
    WhatsAppRecipient,
    WhatsAppSendLog,
)
from services.whatsapp_sender import WhatsAppSenderService

from .models import AlertEvent, AlertRule

logger = logging.getLogger("alerting")

_cache = {"rules": None, "loaded_at": None}
CACHE_TTL_SECONDS = 60


class AlertRulesEngine:
    @classmethod
    def evaluate(
        cls,
        reading: SensorReading,
        prediction: dict | None,
    ) -> list[AlertEvent]:
        rules = cls._get_active_rules()
        new_events = []

        for rule in rules:
            triggered, triggered_value = cls._check_rule(rule, reading, prediction)
            if not triggered:
                continue

            severity = cls._calc_severity(rule, triggered_value)

            if cls._cooldown_applies(rule, severity):
                logger.debug("Cooldown active for rule %s; skipping", rule.rule_type)
                continue

            message = cls._render_message(
                rule,
                reading,
                prediction,
                triggered_value,
                severity,
            )

            prediction_id = None
            if prediction and prediction.get("db_id"):
                prediction_id = prediction["db_id"]

            event = AlertEvent.objects.create(
                rule=rule,
                reading=reading,
                prediction_id=prediction_id,
                rule_type=rule.rule_type,
                severity=severity,
                triggered_value=triggered_value,
                threshold_value=rule.threshold_value,
                message=message,
                whatsapp_status="PENDING",
            )
            new_events.append(event)
            logger.info(
                "AlertEvent created: rule=%s severity=%s value=%.2f",
                rule.rule_type,
                severity,
                triggered_value,
            )

        if new_events:
            cls._dispatch_whatsapp(new_events)

        return new_events

    @classmethod
    def _check_rule(
        cls,
        rule: AlertRule,
        reading: SensorReading,
        prediction: dict | None,
    ):
        rule_type = rule.rule_type

        if rule_type == "STORM_PROBABILITY":
            if not prediction or prediction.get("status") == "buffering":
                return False, None
            probability = prediction.get("storm_probability", 0.0)
            return probability >= rule.threshold_value, probability

        if rule_type == "PRESSURE_HIGH":
            return reading.pressure_hpa >= rule.threshold_value, reading.pressure_hpa

        if rule_type == "PRESSURE_LOW":
            return reading.pressure_hpa <= rule.threshold_value, reading.pressure_hpa

        if rule_type == "TEMPERATURE_HIGH":
            return reading.temperature_c >= rule.threshold_value, reading.temperature_c

        if rule_type == "TEMPERATURE_LOW":
            return reading.temperature_c <= rule.threshold_value, reading.temperature_c

        return False, None

    @classmethod
    def _calc_severity(cls, rule: AlertRule, triggered_value: float) -> str:
        threshold = rule.threshold_value
        rule_type = rule.rule_type

        if rule_type == "STORM_PROBABILITY":
            if triggered_value >= 0.80:
                return "HIGH"
            if triggered_value >= 0.60:
                return "MEDIUM"
            return "LOW"

        if rule_type == "PRESSURE_HIGH":
            if triggered_value >= threshold + 10:
                return "CRITICAL"
            return "HIGH"

        if rule_type == "PRESSURE_LOW":
            if triggered_value <= threshold - 10:
                return "HIGH"
            return "MEDIUM"

        if rule_type == "TEMPERATURE_HIGH":
            if triggered_value >= threshold + 5:
                return "HIGH"
            return "MEDIUM"

        if rule_type == "TEMPERATURE_LOW":
            if triggered_value <= threshold - 5:
                return "HIGH"
            return "MEDIUM"

        return rule.severity

    @classmethod
    def _cooldown_applies(cls, rule: AlertRule, new_severity: str) -> bool:
        cutoff = now() - timedelta(minutes=rule.cooldown_minutes)
        last_event = (
            AlertEvent.objects.filter(rule_type=rule.rule_type, created_at__gte=cutoff)
            .order_by("-created_at")
            .first()
        )
        if not last_event:
            return False

        rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
        if rank.get(new_severity, 0) > rank.get(last_event.severity, 0):
            return False

        return True

    @classmethod
    def _render_message(
        cls,
        rule: AlertRule,
        reading: SensorReading,
        prediction: dict | None,
        triggered_value: float,
        severity: str,
    ) -> str:
        context = {
            "timestamp": reading.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "pressure": reading.pressure_hpa,
            "temperature": reading.temperature_c,
            "value": triggered_value,
            "threshold": rule.threshold_value,
            "severity": severity,
            "probability": prediction.get("storm_probability", 0.0) if prediction else 0.0,
            "risk_level": prediction.get("risk_level", "UNKNOWN") if prediction else "UNKNOWN",
        }
        try:
            return rule.message_template.format(**context)
        except (KeyError, ValueError) as exc:
            logger.error(
                "Message template render failed for rule %s: %s",
                rule.rule_type,
                exc,
            )
            return (
                f"Alert: {rule.rule_type} triggered at {context['timestamp']}. "
                f"Value: {triggered_value:.2f}"
            )

    @classmethod
    def _get_active_rules(cls) -> list[AlertRule]:
        if _cache["rules"] is not None:
            age = time.time() - _cache["loaded_at"]
            if age < CACHE_TTL_SECONDS:
                return _cache["rules"]

        rules = list(AlertRule.objects.filter(enabled=True))
        _cache["rules"] = rules
        _cache["loaded_at"] = time.time()
        return rules

    @classmethod
    def invalidate_cache(cls):
        _cache["rules"] = None
        _cache["loaded_at"] = None

    @classmethod
    def _dispatch_whatsapp(cls, alert_events):
        if not alert_events:
            return

        alert_event_ids = [event.id for event in alert_events]

        def _run():
            fresh_events = list(AlertEvent.objects.filter(id__in=alert_event_ids))
            if not fresh_events:
                return

            if not SystemSetting.get_value("whatsapp_alerts_enabled", True):
                for event in fresh_events:
                    event.whatsapp_status = AlertEvent.WhatsAppStatus.SKIPPED
                    event.save(update_fields=["whatsapp_status"])
                return

            recipients = list(WhatsAppRecipient.objects.filter(active=True))
            if not recipients:
                for event in fresh_events:
                    event.whatsapp_status = AlertEvent.WhatsAppStatus.SKIPPED
                    event.save(update_fields=["whatsapp_status"])
                return

            sender = WhatsAppSenderService()

            for event in fresh_events:
                any_success = False
                any_failure = False

                for index, recipient in enumerate(recipients):
                    result = sender.send_alert(
                        phone=recipient.phone,
                        message=event.message,
                        alert_event_id=event.id,
                        recipient_id=recipient.id,
                    )
                    if result.success:
                        any_success = True
                    else:
                        any_failure = True

                    if index < len(recipients) - 1:
                        time.sleep(WhatsAppSenderService.INTER_SEND_DELAY)

                if any_success:
                    event.whatsapp_status = AlertEvent.WhatsAppStatus.SENT
                else:
                    last_log_status = (
                        WhatsAppSendLog.objects.filter(alert_event_id=event.id)
                        .order_by("-attempted_at")
                        .values_list("status", flat=True)
                        .first()
                    )
                    event.whatsapp_status = (
                        last_log_status or AlertEvent.WhatsAppStatus.FAILED
                    )

                if any_success or any_failure:
                    event.sent_at = now()
                    event.save(update_fields=["whatsapp_status", "sent_at"])
                else:
                    event.save(update_fields=["whatsapp_status"])

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

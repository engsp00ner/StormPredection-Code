from datetime import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.sensor_ingest.models import SensorReading
from apps.whatsapp_integration.models import WhatsAppRuntimeStatus, WhatsAppSendLog
from services.whatsapp_sender import WhatsAppSenderService

from .engine import AlertRulesEngine
from .models import AlertRule


class AlertMessageFormattingTests(TestCase):
    def test_render_message_converts_escaped_newlines(self):
        rule = AlertRule.objects.create(
            rule_type=AlertRule.RuleType.STORM_PROBABILITY,
            name="Storm Probability Alert",
            threshold_value=0.70,
            severity=AlertRule.Severity.HIGH,
            enabled=True,
            cooldown_minutes=30,
            message_template=(
                "STORM ALERT\\n"
                "Storm probability: {probability:.0%} | Risk: {risk_level}\\n"
                "Pressure: {pressure:.1f} hPa | Temp: {temperature:.1f}C\\n"
                "Time: {timestamp}"
            ),
        )
        reading = SensorReading.objects.create(
            timestamp=timezone.make_aware(datetime(2026, 3, 18, 11, 9, 42)),
            pressure_hpa=1016.5,
            temperature_c=26.9,
        )

        message = AlertRulesEngine._render_message(
            rule=rule,
            reading=reading,
            prediction={"storm_probability": 0.67, "risk_level": "MEDIUM"},
            triggered_value=0.67,
            severity=AlertRule.Severity.MEDIUM,
        )

        self.assertEqual(
            message,
            "STORM ALERT\n"
            "Storm probability: 67% | Risk: MEDIUM\n"
            "Pressure: 1016.5 hPa | Temp: 26.9C\n"
            "Time: 2026-03-18 11:09:42",
        )

    @patch("services.whatsapp_sender.pywhatkit.sendwhatmsg_instantly")
    def test_sender_normalizes_existing_alert_messages_before_send(self, send_mock):
        WhatsAppRuntimeStatus.objects.create(id=1, browser_ready=True)

        result = WhatsAppSenderService().send_alert(
            phone="+201234567890",
            message="STORM ALERT\\nStorm probability: 67%",
        )

        self.assertTrue(result.success)
        send_mock.assert_called_once_with(
            phone_no="+201234567890",
            message="STORM ALERT\nStorm probability: 67%",
            wait_time=WhatsAppSenderService.WAIT_TIME_SECONDS,
            tab_close=True,
            close_time=WhatsAppSenderService.TAB_CLOSE_DELAY,
        )
        log = WhatsAppSendLog.objects.get(id=result.log_id)
        self.assertEqual(log.message, "STORM ALERT\nStorm probability: 67%")

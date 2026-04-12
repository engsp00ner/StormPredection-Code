import json
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.settings_manager.models import SystemSetting
from apps.whatsapp_integration.models import WhatsAppRecipient, WhatsAppSendLog
from services.whatsapp_sender import WhatsAppSenderService

from .models import AlertEvent, AlertRule
from .serializers import AlertRuleSerializer, AlertRuleUpdateSerializer


class AlertEventListView(View):
    def get(self, request):
        hours = int(request.GET.get("hours", 24))
        limit = int(request.GET.get("limit", 100))
        offset = int(request.GET.get("offset", 0))
        rule_type = request.GET.get("rule_type")
        severity = request.GET.get("severity")
        whatsapp_status = request.GET.get("whatsapp_status")

        since = timezone.now() - timedelta(hours=hours)
        queryset = AlertEvent.objects.filter(created_at__gte=since).order_by("-created_at")
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)
        if severity:
            queryset = queryset.filter(severity=severity)
        if whatsapp_status:
            queryset = queryset.filter(whatsapp_status=whatsapp_status)

        total = queryset.count()
        alerts = list(
            queryset[offset : offset + limit].values(
                "id",
                "rule_type",
                "severity",
                "triggered_value",
                "threshold_value",
                "message",
                "whatsapp_status",
                "created_at",
                "sent_at",
            )
        )
        return JsonResponse({"count": total, "alerts": alerts})


class AlertRuleListView(View):
    def get(self, request):
        rules = AlertRule.objects.order_by("id")
        serializer = AlertRuleSerializer(rules, many=True)
        return JsonResponse({"rules": serializer.data})


class AlertRuleDetailView(View):
    def patch(self, request, pk: int):
        try:
            rule = AlertRule.objects.get(pk=pk)
        except AlertRule.DoesNotExist:
            return JsonResponse({"error": "rule_not_found"}, status=404)

        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = AlertRuleUpdateSerializer(data=payload, partial=True)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        for field, value in serializer.validated_data.items():
            setattr(rule, field, value)
        rule.save()

        return JsonResponse(AlertRuleSerializer(rule).data)


@method_decorator(csrf_exempt, name="dispatch")
class AlertRetryView(View):
    def post(self, request, pk: int):
        try:
            alert_event = AlertEvent.objects.get(pk=pk)
        except AlertEvent.DoesNotExist:
            return JsonResponse({"error": "alert_not_found"}, status=404)

        if alert_event.whatsapp_status not in {
            AlertEvent.WhatsAppStatus.FAILED,
            AlertEvent.WhatsAppStatus.MANUAL_CHECK_NEEDED,
        }:
            return JsonResponse(
                {
                    "error": "retry_not_allowed",
                    "detail": "Retry is only available for FAILED or MANUAL_CHECK_NEEDED alerts.",
                },
                status=400,
            )

        if not SystemSetting.get_value("whatsapp_alerts_enabled", True):
            alert_event.whatsapp_status = AlertEvent.WhatsAppStatus.SKIPPED
            alert_event.save(update_fields=["whatsapp_status"])
            return JsonResponse(
                {
                    "alert_event_id": alert_event.id,
                    "recipients_attempted": 0,
                    "results": [],
                }
            )

        recipients = list(WhatsAppRecipient.objects.filter(active=True))
        if not recipients:
            alert_event.whatsapp_status = AlertEvent.WhatsAppStatus.SKIPPED
            alert_event.save(update_fields=["whatsapp_status"])
            return JsonResponse(
                {
                    "alert_event_id": alert_event.id,
                    "recipients_attempted": 0,
                    "results": [],
                }
            )

        sender = WhatsAppSenderService()
        results = []
        any_success = False

        for recipient in recipients:
            result = sender.send_alert(
                phone=recipient.phone,
                message=alert_event.message,
                alert_event_id=alert_event.id,
                recipient_id=recipient.id,
            )
            latest_log = WhatsAppSendLog.objects.filter(id=result.log_id).first()
            status = latest_log.status if latest_log else "FAILED"
            if result.success:
                any_success = True
            results.append(
                {
                    "recipient_id": recipient.id,
                    "phone": recipient.phone,
                    "status": status,
                    "log_id": result.log_id,
                }
            )

        if any_success:
            alert_event.whatsapp_status = AlertEvent.WhatsAppStatus.SENT
        else:
            last_status = (
                WhatsAppSendLog.objects.filter(alert_event_id=alert_event.id)
                .order_by("-attempted_at")
                .values_list("status", flat=True)
                .first()
            )
            alert_event.whatsapp_status = last_status or AlertEvent.WhatsAppStatus.FAILED

        alert_event.sent_at = timezone.now()
        alert_event.save(update_fields=["whatsapp_status", "sent_at"])

        return JsonResponse(
            {
                "alert_event_id": alert_event.id,
                "recipients_attempted": len(recipients),
                "results": results,
            }
        )

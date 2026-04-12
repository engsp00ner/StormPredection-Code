from __future__ import annotations

import json
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.settings_manager.models import SystemSetting
from services.whatsapp_sender import WhatsAppSenderService

from .models import WhatsAppRecipient, WhatsAppRuntimeStatus, WhatsAppSendLog
from .serializers import (
    RecipientUpdateSerializer,
    SetReadySerializer,
    TestSendSerializer,
    WhatsAppRecipientSerializer,
    WhatsAppSendLogSerializer,
    WhatsAppStatusSerializer,
)


STALE_THRESHOLD_HOURS = 4


def _build_status_payload() -> dict:
    runtime_status = WhatsAppRuntimeStatus.get_singleton()
    now = timezone.now()
    stale_warning = (
        runtime_status.browser_ready
        and runtime_status.last_confirmed_at is not None
        and runtime_status.last_confirmed_at < now - timedelta(hours=STALE_THRESHOLD_HOURS)
    )
    since = now - timedelta(hours=24)
    return {
        "browser_ready": runtime_status.browser_ready,
        "last_confirmed_at": runtime_status.last_confirmed_at,
        "confirmed_by": runtime_status.confirmed_by,
        "alerts_enabled": SystemSetting.get_value("whatsapp_alerts_enabled", True),
        "stale_warning": stale_warning,
        "stale_threshold_hours": STALE_THRESHOLD_HOURS,
        "pending_send_count": 0,
        "failed_send_count_24h": WhatsAppSendLog.objects.filter(
            attempted_at__gte=since,
            status=WhatsAppSendLog.Status.FAILED,
        ).count(),
    }


class WhatsAppStatusView(View):
    def get(self, request):
        serializer = WhatsAppStatusSerializer(_build_status_payload())
        return JsonResponse(serializer.data)


@method_decorator(csrf_exempt, name="dispatch")
class SetReadyView(View):
    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = SetReadySerializer(data=payload)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        runtime_status = WhatsAppRuntimeStatus.get_singleton()
        runtime_status.browser_ready = serializer.validated_data["ready"]
        runtime_status.confirmed_by = serializer.validated_data.get("confirmed_by", "")
        runtime_status.last_confirmed_at = (
            timezone.now() if runtime_status.browser_ready else None
        )
        runtime_status.save(
            update_fields=["browser_ready", "confirmed_by", "last_confirmed_at", "updated_at"]
        )

        return JsonResponse(
            {
                "browser_ready": runtime_status.browser_ready,
                "last_confirmed_at": runtime_status.last_confirmed_at,
                "confirmed_by": runtime_status.confirmed_by,
            }
        )


class SendLogView(View):
    def get(self, request):
        hours = int(request.GET.get("hours", 24))
        limit = int(request.GET.get("limit", 100))
        offset = int(request.GET.get("offset", 0))
        status = request.GET.get("status")

        since = timezone.now() - timedelta(hours=hours)
        queryset = WhatsAppSendLog.objects.filter(attempted_at__gte=since)
        if status:
            queryset = queryset.filter(status=status)
        queryset = queryset.order_by("-attempted_at")

        total = queryset.count()
        serializer = WhatsAppSendLogSerializer(
            queryset[offset : offset + limit],
            many=True,
        )
        return JsonResponse({"count": total, "logs": serializer.data})


@method_decorator(csrf_exempt, name="dispatch")
class RecipientListCreateView(View):
    def get(self, request):
        recipients = WhatsAppRecipient.objects.order_by("-created_at")
        serializer = WhatsAppRecipientSerializer(recipients, many=True)
        return JsonResponse({"recipients": serializer.data})

    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        phone = payload.get("phone", "")
        if phone and WhatsAppRecipient.objects.filter(phone=phone).exists():
            return JsonResponse(
                {
                    "error": "duplicate_phone",
                    "detail": f"Phone {phone} is already registered.",
                },
                status=409,
            )

        serializer = WhatsAppRecipientSerializer(data=payload)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        recipient = serializer.save()
        return JsonResponse(
            WhatsAppRecipientSerializer(recipient).data,
            status=201,
        )


@method_decorator(csrf_exempt, name="dispatch")
class RecipientDetailView(View):
    def patch(self, request, pk: int):
        try:
            recipient = WhatsAppRecipient.objects.get(pk=pk)
        except WhatsAppRecipient.DoesNotExist:
            return JsonResponse({"error": "recipient_not_found"}, status=404)

        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = RecipientUpdateSerializer(data=payload, partial=True)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        phone = serializer.validated_data.get("phone")
        if phone and WhatsAppRecipient.objects.exclude(pk=pk).filter(phone=phone).exists():
            return JsonResponse(
                {
                    "error": "duplicate_phone",
                    "detail": f"Phone {phone} is already registered.",
                },
                status=409,
            )

        for field, value in serializer.validated_data.items():
            setattr(recipient, field, value)
        recipient.save()
        return JsonResponse(WhatsAppRecipientSerializer(recipient).data)

    def delete(self, request, pk: int):
        try:
            recipient = WhatsAppRecipient.objects.get(pk=pk)
        except WhatsAppRecipient.DoesNotExist:
            return JsonResponse({"error": "recipient_not_found"}, status=404)

        recipient.delete()
        return JsonResponse({}, status=204)


@method_decorator(csrf_exempt, name="dispatch")
class TestSendView(View):
    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = TestSendSerializer(data=payload)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        try:
            recipient = WhatsAppRecipient.objects.get(
                pk=serializer.validated_data["recipient_id"]
            )
        except WhatsAppRecipient.DoesNotExist:
            return JsonResponse({"error": "recipient_not_found"}, status=404)

        sender = WhatsAppSenderService()
        result = sender.send_alert(
            phone=recipient.phone,
            message=serializer.validated_data["message"],
            recipient_id=recipient.id,
            is_test=True,
        )

        latest_log = WhatsAppSendLog.objects.filter(id=result.log_id).first()
        payload = {
            "log_id": result.log_id,
            "phone": recipient.phone,
            "status": latest_log.status if latest_log else "FAILED",
        }
        if result.error:
            payload["error"] = result.error
        return JsonResponse(payload)

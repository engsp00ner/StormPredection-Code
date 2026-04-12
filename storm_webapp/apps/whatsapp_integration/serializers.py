from __future__ import annotations

import re

from rest_framework import serializers

from .models import WhatsAppRecipient, WhatsAppSendLog


E164_REGEX = re.compile(r"^\+[1-9]\d{7,14}$")


class WhatsAppStatusSerializer(serializers.Serializer):
    browser_ready = serializers.BooleanField()
    last_confirmed_at = serializers.DateTimeField(allow_null=True)
    confirmed_by = serializers.CharField(allow_blank=True)
    alerts_enabled = serializers.BooleanField()
    stale_warning = serializers.BooleanField()
    stale_threshold_hours = serializers.IntegerField()
    pending_send_count = serializers.IntegerField()
    failed_send_count_24h = serializers.IntegerField()


class SetReadySerializer(serializers.Serializer):
    ready = serializers.BooleanField()
    confirmed_by = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )


class WhatsAppSendLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppSendLog
        fields = [
            "id",
            "phone",
            "message",
            "status",
            "error_message",
            "attempted_at",
            "is_test",
            "alert_event_id",
            "recipient_id",
        ]


class WhatsAppRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppRecipient
        fields = ["id", "name", "phone", "active", "notes", "created_at"]

    def validate_phone(self, value: str) -> str:
        if not E164_REGEX.match(value):
            raise serializers.ValidationError(
                "Must be in E.164 format: +[country][number]"
            )
        return value


class RecipientUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=100)
    phone = serializers.CharField(required=False, max_length=20)
    active = serializers.BooleanField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_phone(self, value: str) -> str:
        if not E164_REGEX.match(value):
            raise serializers.ValidationError(
                "Must be in E.164 format: +[country][number]"
            )
        return value


class TestSendSerializer(serializers.Serializer):
    recipient_id = serializers.IntegerField()
    message = serializers.CharField(max_length=1000)

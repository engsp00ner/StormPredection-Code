from __future__ import annotations

from rest_framework import serializers

from .models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ["key", "value", "value_type", "description", "updated_at"]


class SystemSettingUpdateSerializer(serializers.Serializer):
    value = serializers.CharField()

from __future__ import annotations

import json

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.alerting.models import AlertRule

from .models import SystemSetting
from .serializers import SystemSettingSerializer, SystemSettingUpdateSerializer


def _validate_cast(setting: SystemSetting, raw_value: str) -> None:
    if setting.value_type == SystemSetting.ValueType.INT:
        int(raw_value)
        return
    if setting.value_type == SystemSetting.ValueType.FLOAT:
        float(raw_value)
        return
    if setting.value_type == SystemSetting.ValueType.BOOL:
        lowered = raw_value.lower()
        if lowered not in {"true", "false", "1", "0", "yes", "no"}:
            raise ValueError(f"Cannot cast {raw_value!r} to bool.")


def _sync_alert_rule(setting: SystemSetting) -> None:
    threshold_mapping = {
        "storm_probability_threshold": AlertRule.RuleType.STORM_PROBABILITY,
        "pressure_high_threshold": AlertRule.RuleType.PRESSURE_HIGH,
        "pressure_low_threshold": AlertRule.RuleType.PRESSURE_LOW,
        "temperature_high_threshold": AlertRule.RuleType.TEMPERATURE_HIGH,
        "temperature_low_threshold": AlertRule.RuleType.TEMPERATURE_LOW,
    }

    rule_type = threshold_mapping.get(setting.key)
    if rule_type:
        AlertRule.objects.filter(rule_type=rule_type).update(
            threshold_value=float(setting.value)
        )
        return

    if setting.key == "alert_cooldown_minutes":
        AlertRule.objects.update(cooldown_minutes=int(setting.value))


class SettingsListView(View):
    def get(self, request):
        settings = SystemSetting.objects.order_by("id")
        serializer = SystemSettingSerializer(settings, many=True)
        return JsonResponse({"settings": serializer.data})


@method_decorator(csrf_exempt, name="dispatch")
class SettingsDetailView(View):
    def put(self, request, key: str):
        try:
            setting = SystemSetting.objects.get(key=key)
        except SystemSetting.DoesNotExist:
            return JsonResponse(
                {"error": "setting_not_found", "key": key},
                status=404,
            )

        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = SystemSettingUpdateSerializer(data=payload)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        raw_value = serializer.validated_data["value"]
        try:
            _validate_cast(setting, raw_value)
        except (TypeError, ValueError):
            return JsonResponse(
                {
                    "error": "invalid_value",
                    "detail": f"Cannot cast {raw_value!r} to {setting.value_type}.",
                },
                status=400,
            )

        setting.value = raw_value
        setting.save(update_fields=["value", "updated_at"])
        _sync_alert_rule(setting)
        return JsonResponse(SystemSettingSerializer(setting).data)

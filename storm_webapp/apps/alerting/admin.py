from django.contrib import admin

from .models import AlertEvent, AlertRule


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = [
        "rule_type",
        "name",
        "threshold_value",
        "severity",
        "enabled",
        "cooldown_minutes",
    ]
    list_editable = ["threshold_value", "enabled", "cooldown_minutes"]


@admin.register(AlertEvent)
class AlertEventAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "rule_type",
        "severity",
        "triggered_value",
        "whatsapp_status",
    ]
    list_filter = ["rule_type", "severity", "whatsapp_status"]
    ordering = ["-created_at"]
    readonly_fields = [
        "created_at",
        "message",
        "triggered_value",
        "threshold_value",
    ]

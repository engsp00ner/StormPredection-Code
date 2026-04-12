from django.contrib import admin

from .models import WhatsAppRecipient, WhatsAppRuntimeStatus, WhatsAppSendLog


@admin.register(WhatsAppRecipient)
class WhatsAppRecipientAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "active", "created_at"]
    list_filter = ["active"]
    ordering = ["name"]


@admin.register(WhatsAppRuntimeStatus)
class WhatsAppRuntimeStatusAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "browser_ready",
        "last_confirmed_at",
        "confirmed_by",
        "updated_at",
    ]


@admin.register(WhatsAppSendLog)
class WhatsAppSendLogAdmin(admin.ModelAdmin):
    list_display = [
        "attempted_at",
        "phone",
        "status",
        "is_test",
        "alert_event",
        "recipient",
    ]
    list_filter = ["status", "is_test"]
    ordering = ["-attempted_at"]

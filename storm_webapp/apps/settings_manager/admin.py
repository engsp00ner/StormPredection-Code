from django.contrib import admin

from .models import SystemSetting


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ["key", "value", "value_type", "updated_at"]
    ordering = ["key"]

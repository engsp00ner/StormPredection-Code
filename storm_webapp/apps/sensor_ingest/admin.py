from django.contrib import admin

from .models import SensorReading


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = [
        "timestamp",
        "pressure_hpa",
        "temperature_c",
        "source",
        "received_at",
    ]
    list_filter = ["source"]
    ordering = ["-timestamp"]

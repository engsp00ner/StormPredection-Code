from django.contrib import admin

from .models import Prediction


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "reading",
        "storm_probability",
        "prediction",
        "risk_level",
        "decision_threshold",
    ]
    list_filter = ["risk_level", "prediction"]
    ordering = ["-created_at"]

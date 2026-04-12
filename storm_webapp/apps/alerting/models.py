from django.db import models

from apps.predictions.models import Prediction
from apps.sensor_ingest.models import SensorReading


class AlertRule(models.Model):
    class RuleType(models.TextChoices):
        STORM_PROBABILITY = "STORM_PROBABILITY"
        PRESSURE_HIGH = "PRESSURE_HIGH"
        PRESSURE_LOW = "PRESSURE_LOW"
        TEMPERATURE_HIGH = "TEMPERATURE_HIGH"
        TEMPERATURE_LOW = "TEMPERATURE_LOW"

    class Severity(models.TextChoices):
        LOW = "LOW"
        MEDIUM = "MEDIUM"
        HIGH = "HIGH"
        CRITICAL = "CRITICAL"

    RULE_TYPE_CHOICES = RuleType.choices

    rule_type = models.CharField(
        max_length=30,
        choices=RuleType.choices,
        unique=True,
    )
    name = models.CharField(max_length=100)
    threshold_value = models.FloatField()
    severity = models.CharField(max_length=10, choices=Severity.choices)
    enabled = models.BooleanField(default=True)
    cooldown_minutes = models.IntegerField(default=30)
    message_template = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.rule_type} (threshold={self.threshold_value})"


class AlertEvent(models.Model):
    class WhatsAppStatus(models.TextChoices):
        PENDING = "PENDING"
        SENT = "SENT"
        FAILED = "FAILED"
        SKIPPED = "SKIPPED"
        MANUAL_CHECK_NEEDED = "MANUAL_CHECK_NEEDED"

    rule = models.ForeignKey(AlertRule, null=True, on_delete=models.SET_NULL)
    reading = models.ForeignKey(SensorReading, on_delete=models.CASCADE)
    prediction = models.ForeignKey(
        Prediction,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    rule_type = models.CharField(max_length=30)
    severity = models.CharField(max_length=10)
    triggered_value = models.FloatField()
    threshold_value = models.FloatField()
    message = models.TextField()
    whatsapp_status = models.CharField(
        max_length=25,
        choices=WhatsAppStatus.choices,
        default=WhatsAppStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["rule_type"]),
            models.Index(fields=["whatsapp_status"]),
            models.Index(fields=["rule_type", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"AlertEvent {self.rule_type} {self.severity} at {self.created_at}"

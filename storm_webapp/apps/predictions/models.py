from django.db import models

from apps.sensor_ingest.models import SensorReading


class Prediction(models.Model):
    class RiskLevel(models.TextChoices):
        LOW = "LOW"
        MEDIUM = "MEDIUM"
        HIGH = "HIGH"

    reading = models.OneToOneField(
        SensorReading,
        on_delete=models.CASCADE,
        related_name="prediction",
    )
    storm_probability = models.FloatField()
    prediction = models.IntegerField()
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)
    decision_threshold = models.FloatField(default=0.5)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_at"])]

    def __str__(self) -> str:
        return (
            f"Prediction {self.created_at}: "
            f"{self.risk_level} ({self.storm_probability:.2%})"
        )

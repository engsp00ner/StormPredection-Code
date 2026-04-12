from django.db import models


class SensorReading(models.Model):
    class Source(models.TextChoices):
        SENSOR = "sensor"
        SIMULATOR = "simulator"
        MANUAL = "manual"

    timestamp = models.DateTimeField(unique=True)
    pressure_hpa = models.FloatField()
    temperature_c = models.FloatField()
    received_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.SENSOR,
    )

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["timestamp", "source"]),
        ]

    def __str__(self) -> str:
        return (
            f"Reading {self.timestamp} "
            f"P={self.pressure_hpa} T={self.temperature_c}"
        )

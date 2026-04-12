from django.db import models


class WhatsAppRecipient(models.Model):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, unique=True)
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.phone})"


class WhatsAppRuntimeStatus(models.Model):
    browser_ready = models.BooleanField(default=False)
    last_confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "WhatsApp Runtime Status"

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    def __str__(self) -> str:
        return f"WhatsApp Status: {'READY' if self.browser_ready else 'NOT READY'}"


class WhatsAppSendLog(models.Model):
    class Status(models.TextChoices):
        SUCCESS = "SUCCESS"
        FAILED = "FAILED"
        MANUAL_CHECK_NEEDED = "MANUAL_CHECK_NEEDED"

    alert_event = models.ForeignKey(
        "alerting.AlertEvent",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    recipient = models.ForeignKey(
        WhatsAppRecipient,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    phone = models.CharField(max_length=20)
    message = models.TextField()
    status = models.CharField(max_length=25, choices=Status.choices)
    error_message = models.TextField(blank=True, null=True)
    attempted_at = models.DateTimeField(auto_now_add=True)
    is_test = models.BooleanField(default=False)

    class Meta:
        ordering = ["-attempted_at"]
        indexes = [
            models.Index(fields=["attempted_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"SendLog {self.phone} {self.status} at {self.attempted_at}"

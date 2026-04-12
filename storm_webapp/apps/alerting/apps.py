from django.apps import AppConfig


class AlertingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.alerting"

    def ready(self) -> None:
        import apps.alerting.signals  # noqa: F401

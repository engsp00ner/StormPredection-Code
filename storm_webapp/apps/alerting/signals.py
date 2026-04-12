from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import AlertRule


@receiver(post_save, sender=AlertRule)
@receiver(post_delete, sender=AlertRule)
def invalidate_alert_rule_cache(sender, **kwargs):
    from .engine import AlertRulesEngine

    AlertRulesEngine.invalidate_cache()

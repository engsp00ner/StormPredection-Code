from rest_framework import serializers

from .models import AlertRule


class AlertRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertRule
        fields = [
            "id",
            "rule_type",
            "name",
            "threshold_value",
            "severity",
            "enabled",
            "cooldown_minutes",
            "message_template",
        ]


class AlertRuleUpdateSerializer(serializers.Serializer):
    threshold_value = serializers.FloatField(required=False)
    enabled = serializers.BooleanField(required=False)
    cooldown_minutes = serializers.IntegerField(min_value=1, required=False)
    message_template = serializers.CharField(required=False)

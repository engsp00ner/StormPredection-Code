from django.db import models


class SystemSetting(models.Model):
    class ValueType(models.TextChoices):
        STR = "str"
        INT = "int"
        FLOAT = "float"
        BOOL = "bool"

    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    value_type = models.CharField(
        max_length=5,
        choices=ValueType.choices,
        default=ValueType.STR,
    )
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.key} = {self.value}"

    @classmethod
    def get_value(cls, key: str, default=None):
        try:
            obj = cls.objects.get(key=key)
        except cls.DoesNotExist:
            return default
        if obj.value_type == "int":
            return int(obj.value)
        if obj.value_type == "float":
            return float(obj.value)
        if obj.value_type == "bool":
            return obj.value.lower() in ("true", "1", "yes")
        return obj.value

    @classmethod
    def set_value(cls, key: str, value) -> None:
        cls.objects.filter(key=key).update(value=str(value))

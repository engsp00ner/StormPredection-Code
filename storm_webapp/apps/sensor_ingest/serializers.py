from rest_framework import serializers


class ReadingSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    pressure_hPa = serializers.FloatField(min_value=900.0, max_value=1100.0)
    temperature_C = serializers.FloatField(min_value=-60.0, max_value=60.0)
    source = serializers.ChoiceField(
        choices=["sensor", "simulator", "manual"],
        default="sensor",
        required=False,
    )

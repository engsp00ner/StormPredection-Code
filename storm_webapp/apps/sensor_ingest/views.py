import json
import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.predictions.models import Prediction
from ml_engine.predictor import get_predictor

from apps.alerting.engine import AlertRulesEngine
from .auth import require_api_key
from .models import SensorReading
from .serializers import ReadingSerializer

logger = logging.getLogger("sensor_ingest")


class ReadingListView(View):
    def get(self, request):
        hours = int(request.GET.get("hours", 24))
        limit = int(request.GET.get("limit", 500))
        offset = int(request.GET.get("offset", 0))
        source = request.GET.get("source")

        since = timezone.now() - timedelta(hours=hours)
        queryset = SensorReading.objects.filter(received_at__gte=since)
        if source:
            queryset = queryset.filter(source=source)

        queryset = queryset.order_by("timestamp")
        total = queryset.count()
        readings = list(
            queryset[offset : offset + limit].values(
                "id",
                "timestamp",
                "pressure_hpa",
                "temperature_c",
                "received_at",
                "source",
            )
        )
        for reading in readings:
            reading["pressure_hPa"] = reading.pop("pressure_hpa")
            reading["temperature_C"] = reading.pop("temperature_c")

        return JsonResponse({"count": total, "readings": readings})


@method_decorator(csrf_exempt, name="dispatch")
class ReadingIngestView(View):
    def get(self, request):
        return ReadingListView().get(request)

    @require_api_key
    def post(self, request):
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = ReadingSerializer(data=data)
        if not serializer.is_valid():
            return JsonResponse(
                {"error": "validation_failed", "detail": serializer.errors},
                status=400,
            )

        validated = serializer.validated_data
        timestamp = validated["timestamp"]

        if SensorReading.objects.filter(timestamp=timestamp).exists():
            return JsonResponse(
                {
                    "error": "duplicate_timestamp",
                    "detail": f"A reading with timestamp {timestamp} already exists.",
                },
                status=409,
            )

        reading = SensorReading.objects.create(
            timestamp=timestamp,
            pressure_hpa=validated["pressure_hPa"],
            temperature_c=validated["temperature_C"],
            source=validated.get("source", "sensor"),
        )

        prediction_data = None
        prediction_status = "ok"
        predictor = get_predictor()
        pred_obj = None
        result = None

        if predictor is None:
            prediction_status = "model_unavailable"
        else:
            result = predictor.add_reading(
                {
                    "timestamp": timestamp.isoformat(),
                    "pressure_hPa": reading.pressure_hpa,
                    "temperature_C": reading.temperature_c,
                }
            )
            if result and result.get("status") != "buffering":
                pred_obj = Prediction.objects.create(
                    reading=reading,
                    storm_probability=result["storm_probability"],
                    prediction=result["prediction"],
                    risk_level=result["risk_level"],
                    decision_threshold=result.get("decision_threshold", 0.5),
                )
                prediction_data = {
                    "storm_probability": pred_obj.storm_probability,
                    "prediction": pred_obj.prediction,
                    "risk_level": pred_obj.risk_level,
                    "decision_threshold": pred_obj.decision_threshold,
                }
                result["db_id"] = pred_obj.id
            elif result and result.get("status") == "buffering":
                prediction_status = "buffering"

        prediction_for_engine = None
        if prediction_data and pred_obj is not None:
            prediction_for_engine = dict(prediction_data)
            prediction_for_engine["db_id"] = pred_obj.id
            prediction_for_engine["status"] = "ok"

        alert_events = AlertRulesEngine.evaluate(reading, prediction_for_engine)

        response = {
            "reading_id": reading.id,
            "prediction": prediction_data,
            "prediction_status": prediction_status,
            "alerts_triggered": len(alert_events),
            "status": prediction_status if prediction_status != "ok" else "ok",
        }
        if prediction_status == "buffering" and result:
            response["buffer_readings"] = result.get("readings")

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "dashboard",
            {
                "type": "sensor.update",
                "reading": {
                    "id": reading.id,
                    "timestamp": reading.timestamp.isoformat(),
                    "pressure_hPa": reading.pressure_hpa,
                    "temperature_C": reading.temperature_c,
                },
                "prediction": prediction_data,
                "prediction_status": prediction_status,
                "alerts": [
                    {
                        "id": event.id,
                        "rule_type": event.rule_type,
                        "severity": event.severity,
                        "message": event.message,
                    }
                    for event in alert_events
                ],
            },
        )

        logger.info("Reading ingested id=%s status=%s", reading.id, prediction_status)
        return JsonResponse(response, status=201)

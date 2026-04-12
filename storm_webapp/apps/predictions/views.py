from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views import View

from .models import Prediction


class PredictionLatestView(View):
    def get(self, request):
        prediction = Prediction.objects.order_by("-created_at").first()
        if prediction is None:
            return JsonResponse(
                {
                    "id": None,
                    "storm_probability": None,
                    "risk_level": None,
                    "status": "no_predictions",
                }
            )

        return JsonResponse(
            {
                "id": prediction.id,
                "reading_id": prediction.reading_id,
                "storm_probability": prediction.storm_probability,
                "prediction": prediction.prediction,
                "risk_level": prediction.risk_level,
                "decision_threshold": prediction.decision_threshold,
                "created_at": prediction.created_at,
            }
        )


class PredictionListView(View):
    def get(self, request):
        hours = int(request.GET.get("hours", 24))
        limit = int(request.GET.get("limit", 500))
        offset = int(request.GET.get("offset", 0))
        since = timezone.now() - timedelta(hours=hours)

        queryset = Prediction.objects.filter(created_at__gte=since).order_by("-created_at")
        total = queryset.count()
        predictions = list(
            queryset[offset : offset + limit].values(
                "id",
                "reading_id",
                "storm_probability",
                "prediction",
                "risk_level",
                "decision_threshold",
                "created_at",
            )
        )
        return JsonResponse({"count": total, "predictions": predictions})

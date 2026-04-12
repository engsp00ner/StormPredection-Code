from django.urls import path

from .views import PredictionLatestView, PredictionListView

urlpatterns = [
    path("predictions/", PredictionListView.as_view()),
    path("predictions/latest/", PredictionLatestView.as_view()),
]

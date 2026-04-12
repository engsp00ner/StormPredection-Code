from django.urls import path

from .views import ReadingIngestView

urlpatterns = [
    path("readings/", ReadingIngestView.as_view()),
]

from django.urls import path

from .views import (
    AlertEventListView,
    AlertRetryView,
    AlertRuleDetailView,
    AlertRuleListView,
)

urlpatterns = [
    path("alerts/", AlertEventListView.as_view()),
    path("alerts/<int:pk>/retry/", AlertRetryView.as_view()),
    path("alert-rules/", AlertRuleListView.as_view()),
    path("alert-rules/<int:pk>/", AlertRuleDetailView.as_view()),
]

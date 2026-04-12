from django.urls import path

from .views import SettingsDetailView, SettingsListView

urlpatterns = [
    path("settings/", SettingsListView.as_view()),
    path("settings/<str:key>/", SettingsDetailView.as_view()),
]

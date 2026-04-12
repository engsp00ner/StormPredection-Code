from django.urls import path

from .views import (
    RecipientDetailView,
    RecipientListCreateView,
    SendLogView,
    SetReadyView,
    TestSendView,
    WhatsAppStatusView,
)

urlpatterns = [
    path("whatsapp/recipients/", RecipientListCreateView.as_view()),
    path("whatsapp/recipients/<int:pk>/", RecipientDetailView.as_view()),
    path("whatsapp/status/", WhatsAppStatusView.as_view()),
    path("whatsapp/status/set-ready/", SetReadyView.as_view()),
    path("whatsapp/test-send/", TestSendView.as_view()),
    path("whatsapp/send-log/", SendLogView.as_view()),
]

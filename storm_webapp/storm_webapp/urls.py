"""URL configuration for storm_webapp project."""

from django.contrib import admin
from django.http import Http404
from django.urls import include, path


def root_not_found(_request):
    raise Http404("No route is configured for the root path yet.")


urlpatterns = [
    path("api/v1/", include("apps.alerting.urls")),
    path("api/v1/", include("apps.predictions.urls")),
    path("api/v1/", include("apps.sensor_ingest.urls")),
    path("api/v1/", include("apps.settings_manager.urls")),
    path("api/v1/", include("apps.whatsapp_integration.urls")),
    path("", include("apps.dashboard.urls")),
    path("", root_not_found),
    path("admin/", admin.site.urls),
]

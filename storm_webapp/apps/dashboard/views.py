from django.views.generic import TemplateView

from apps.settings_manager.models import SystemSetting


class DashboardView(TemplateView):
    template_name = "dashboard/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(
            {
                "pressure_high_threshold": SystemSetting.get_value(
                    "pressure_high_threshold",
                    1030.0,
                ),
                "pressure_low_threshold": SystemSetting.get_value(
                    "pressure_low_threshold",
                    990.0,
                ),
                "temperature_high_threshold": SystemSetting.get_value(
                    "temperature_high_threshold",
                    40.0,
                ),
                "temperature_low_threshold": SystemSetting.get_value(
                    "temperature_low_threshold",
                    0.0,
                ),
            }
        )
        return context

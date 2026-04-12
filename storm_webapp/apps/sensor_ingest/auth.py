from functools import wraps

from django.conf import settings
from django.http import JsonResponse


def require_api_key(view_func):
    @wraps(view_func)
    def wrapper(self, request, *args, **kwargs):
        key = request.headers.get("X-API-Key", "")
        if key != settings.SENSOR_API_KEY:
            return JsonResponse({"error": "invalid_api_key"}, status=401)
        return view_func(self, request, *args, **kwargs)

    return wrapper

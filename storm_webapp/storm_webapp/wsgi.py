"""WSGI config for storm_webapp project."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "storm_webapp.settings.local")

application = get_wsgi_application()

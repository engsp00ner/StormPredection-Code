# Codex Execution Roadmap
## Storm Prediction — Phase 2

---

## How to Use This Document

- Implement phases in order. Do not start a phase until the previous phase passes all acceptance criteria.
- Each milestone has a self-contained set of files to create or modify, a description of what to implement, and acceptance criteria you can verify before moving on.
- Never modify files in `src/` or `models/storm_model_v1.pkl`.
- When a section says "reuse", it means import or reference — not copy.
- When stuck: read the error, re-read the relevant design doc, fix the specific issue. Do not rewrite working code.

---

## Coding Rules (applies to all phases)

1. Never import `pywhatkit` outside `services/whatsapp_sender.py`.
2. Never import `src.predict` or `src.features` outside `ml_engine/predictor.py`.
3. All DB access via Django ORM. No raw SQL.
4. Every view that receives external data validates before writing.
5. Use `logging.getLogger(__name__)` not `print()` in all modules.
6. All exceptions in `WhatsAppSenderService.send_alert()` must be caught. The method must never raise.
7. If `get_predictor()` returns `None`, the ingest view must still return 201 (with `prediction: null`).
8. Use `python-decouple` for reading env vars in `settings/base.py`.
9. Run `daphne` as the ASGI server, single process. Do not use multi-worker gunicorn.
10. All timestamp comparisons use `django.utils.timezone.now()`.

---

## Phase 0 — Project Bootstrap

**Objective:** Create the Django project structure, confirm the existing ML code is importable, and verify the development server starts.

**Reuse from Phase 1:** `src/predict.py`, `src/features.py`, `models/storm_model_v1.pkl` — all imported by reference, not moved.

**New implementation:** Everything in `storm_webapp/`.

---

### Milestone 0.1 — Create project skeleton

**Files to create:**

```
storm_webapp/
├── requirements_webapp.txt
├── .env.example
└── (django-admin will create the rest)
```

**What to implement:**

1. Create `storm_webapp/requirements_webapp.txt`:
   ```
   Django>=5.0,<6.0
   channels>=4.0,<5.0
   daphne>=4.0,<5.0
   djangorestframework>=3.15,<4.0
   pywhatkit>=5.4
   python-decouple>=3.8
   ```

2. From inside `storm_webapp/`, run:
   ```bash
   django-admin startproject storm_webapp .
   ```
   (The `.` prevents a nested `storm_webapp/storm_webapp/` level.)

3. Create `.env.example` (exact content in `docs/env-template.md`).

4. Copy `.env.example` to `.env` and fill in values.

**Acceptance criteria:**
- `python manage.py check` outputs `System check identified no issues (0 silenced).`
- `python manage.py runserver` starts without error.

---

### Milestone 0.2 — Split settings and configure paths

**Files to create/modify:**
```
storm_webapp/settings/
├── __init__.py
├── base.py
├── local.py
└── production.py
```
Delete the original `storm_webapp/settings.py`.

**What to implement in `base.py`:**

```python
import sys
from pathlib import Path
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent  # storm_webapp/
REPO_ROOT = BASE_DIR.parent                         # storm_prediction/

sys.path.insert(0, str(REPO_ROOT))  # makes `src` importable

SECRET_KEY = config("DJANGO_SECRET_KEY")
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")

STORM_MODEL_PATH = config(
    "STORM_MODEL_PATH",
    default=str(REPO_ROOT / "models" / "storm_model_v1.pkl")
)
SENSOR_API_KEY = config("SENSOR_API_KEY", default="change-me")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "channels",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer"
    }
}

ASGI_APPLICATION = "storm_webapp.asgi.application"

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [BASE_DIR / "templates"],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
```

**`local.py`:**
```python
from .base import *
DEBUG = True
```

**`manage.py` and `asgi.py`/`wsgi.py`:** Update `DJANGO_SETTINGS_MODULE` to `storm_webapp.settings.local`.

**Acceptance criteria:**
- `python manage.py check` still passes.
- `python -c "from src.predict import StormPredictor; print('OK')"` run from `storm_webapp/` prints `OK`.
- `STORM_MODEL_PATH` resolves to an existing file: `python -c "from django.conf import settings; import os; print(os.path.exists(settings.STORM_MODEL_PATH))"` prints `True`.

---

### Milestone 0.3 — Configure ASGI for Channels

**Files to modify:**
```
storm_webapp/asgi.py
```

**What to implement:**

```python
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "storm_webapp.settings.local")

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

django_asgi_app = get_asgi_application()

# Import routing after Django setup
from apps.dashboard.routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

Create a placeholder `apps/dashboard/routing.py`:
```python
websocket_urlpatterns = []
```

**Acceptance criteria:**
- `daphne storm_webapp.asgi:application` starts without error.
- HTTP request to `http://localhost:8000/` returns Django's default 404 (not a crash).

---

## Phase 1 — Database Models

**Objective:** Create all models, run migrations, and load initial fixture data.

**Reuse from Phase 1:** Nothing directly. Schema is based on `docs/database-design.md`.

---

### Milestone 1.1 — Create Django apps

Run for each app name: `sensor_ingest`, `predictions`, `alerting`, `whatsapp_integration`, `settings_manager`, `dashboard`:
```bash
python manage.py startapp <name> apps/<name>
```

Add to `INSTALLED_APPS` in `base.py`:
```python
"apps.sensor_ingest",
"apps.predictions",
"apps.alerting",
"apps.whatsapp_integration",
"apps.settings_manager",
"apps.dashboard",
```

Update each app's `apps.py` so `name = "apps.<appname>"`.

**Acceptance criteria:**
- `python manage.py check` passes.

---

### Milestone 1.2 — `sensor_ingest` models

**File:** `apps/sensor_ingest/models.py`

```python
from django.db import models

class SensorReading(models.Model):
    class Source(models.TextChoices):
        SENSOR    = "sensor"
        SIMULATOR = "simulator"
        MANUAL    = "manual"

    timestamp    = models.DateTimeField(unique=True)
    pressure_hpa = models.FloatField()
    temperature_c = models.FloatField()
    received_at  = models.DateTimeField(auto_now_add=True)
    source       = models.CharField(max_length=20, choices=Source.choices, default=Source.SENSOR)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["timestamp", "source"]),
        ]

    def __str__(self):
        return f"Reading {self.timestamp} P={self.pressure_hpa} T={self.temperature_c}"
```

**Acceptance criteria:**
- `python manage.py makemigrations sensor_ingest` creates a migration file.

---

### Milestone 1.3 — `predictions` models

**File:** `apps/predictions/models.py`

```python
from django.db import models
from apps.sensor_ingest.models import SensorReading

class Prediction(models.Model):
    class RiskLevel(models.TextChoices):
        LOW    = "LOW"
        MEDIUM = "MEDIUM"
        HIGH   = "HIGH"

    reading            = models.OneToOneField(SensorReading, on_delete=models.CASCADE, related_name="prediction")
    storm_probability  = models.FloatField()
    prediction         = models.IntegerField()  # 0 or 1
    risk_level         = models.CharField(max_length=10, choices=RiskLevel.choices)
    decision_threshold = models.FloatField(default=0.5)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_at"])]

    def __str__(self):
        return f"Prediction {self.created_at}: {self.risk_level} ({self.storm_probability:.2%})"
```

**Acceptance criteria:**
- `python manage.py makemigrations predictions` creates a migration file.

---

### Milestone 1.4 — `alerting` models

**File:** `apps/alerting/models.py`

```python
from django.db import models
from apps.sensor_ingest.models import SensorReading
from apps.predictions.models import Prediction

class AlertRule(models.Model):
    class RuleType(models.TextChoices):
        STORM_PROBABILITY = "STORM_PROBABILITY"
        PRESSURE_HIGH     = "PRESSURE_HIGH"
        PRESSURE_LOW      = "PRESSURE_LOW"
        TEMPERATURE_HIGH  = "TEMPERATURE_HIGH"
        TEMPERATURE_LOW   = "TEMPERATURE_LOW"

    class Severity(models.TextChoices):
        LOW      = "LOW"
        MEDIUM   = "MEDIUM"
        HIGH     = "HIGH"
        CRITICAL = "CRITICAL"

    RULE_TYPE_CHOICES = RuleType.choices  # exposed for views

    rule_type        = models.CharField(max_length=30, choices=RuleType.choices, unique=True)
    name             = models.CharField(max_length=100)
    threshold_value  = models.FloatField()
    severity         = models.CharField(max_length=10, choices=Severity.choices)
    enabled          = models.BooleanField(default=True)
    cooldown_minutes = models.IntegerField(default=30)
    message_template = models.TextField()
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.rule_type} (threshold={self.threshold_value})"


class AlertEvent(models.Model):
    class WhatsAppStatus(models.TextChoices):
        PENDING              = "PENDING"
        SENT                 = "SENT"
        FAILED               = "FAILED"
        SKIPPED              = "SKIPPED"
        MANUAL_CHECK_NEEDED  = "MANUAL_CHECK_NEEDED"

    rule           = models.ForeignKey(AlertRule, null=True, on_delete=models.SET_NULL)
    reading        = models.ForeignKey(SensorReading, on_delete=models.CASCADE)
    prediction     = models.ForeignKey(Prediction, null=True, blank=True, on_delete=models.SET_NULL)
    rule_type      = models.CharField(max_length=30)
    severity       = models.CharField(max_length=10)
    triggered_value  = models.FloatField()
    threshold_value  = models.FloatField()
    message          = models.TextField()
    whatsapp_status  = models.CharField(max_length=25, choices=WhatsAppStatus.choices, default=WhatsAppStatus.PENDING)
    created_at       = models.DateTimeField(auto_now_add=True)
    sent_at          = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["rule_type"]),
            models.Index(fields=["whatsapp_status"]),
            models.Index(fields=["rule_type", "created_at"]),
        ]

    def __str__(self):
        return f"AlertEvent {self.rule_type} {self.severity} at {self.created_at}"
```

**Acceptance criteria:**
- `python manage.py makemigrations alerting` creates a migration file.

---

### Milestone 1.5 — `whatsapp_integration` models

**File:** `apps/whatsapp_integration/models.py`

```python
from django.db import models

class WhatsAppRecipient(models.Model):
    name       = models.CharField(max_length=100)
    phone      = models.CharField(max_length=20, unique=True)
    active     = models.BooleanField(default=True)
    notes      = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.phone})"


class WhatsAppRuntimeStatus(models.Model):
    browser_ready     = models.BooleanField(default=False)
    last_confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by      = models.CharField(max_length=100, blank=True)
    notes             = models.TextField(blank=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "WhatsApp Runtime Status"

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    def __str__(self):
        return f"WhatsApp Status: {'READY' if self.browser_ready else 'NOT READY'}"


class WhatsAppSendLog(models.Model):
    class Status(models.TextChoices):
        SUCCESS              = "SUCCESS"
        FAILED               = "FAILED"
        MANUAL_CHECK_NEEDED  = "MANUAL_CHECK_NEEDED"

    alert_event = models.ForeignKey(
        "alerting.AlertEvent", null=True, blank=True, on_delete=models.SET_NULL
    )
    recipient   = models.ForeignKey(
        WhatsAppRecipient, null=True, blank=True, on_delete=models.SET_NULL
    )
    phone         = models.CharField(max_length=20)
    message       = models.TextField()
    status        = models.CharField(max_length=25, choices=Status.choices)
    error_message = models.TextField(blank=True, null=True)
    attempted_at  = models.DateTimeField(auto_now_add=True)
    is_test       = models.BooleanField(default=False)

    class Meta:
        ordering = ["-attempted_at"]
        indexes = [
            models.Index(fields=["attempted_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"SendLog {self.phone} {self.status} at {self.attempted_at}"
```

**Acceptance criteria:**
- `python manage.py makemigrations whatsapp_integration` creates a migration file.

---

### Milestone 1.6 — `settings_manager` models

**File:** `apps/settings_manager/models.py`

```python
from django.db import models

class SystemSetting(models.Model):
    class ValueType(models.TextChoices):
        STR   = "str"
        INT   = "int"
        FLOAT = "float"
        BOOL  = "bool"

    key         = models.CharField(max_length=100, unique=True)
    value       = models.TextField()
    value_type  = models.CharField(max_length=5, choices=ValueType.choices, default=ValueType.STR)
    description = models.TextField(blank=True)
    updated_at  = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key} = {self.value}"

    @classmethod
    def get_value(cls, key: str, default=None):
        try:
            obj = cls.objects.get(key=key)
        except cls.DoesNotExist:
            return default
        if obj.value_type == "int":
            return int(obj.value)
        if obj.value_type == "float":
            return float(obj.value)
        if obj.value_type == "bool":
            return obj.value.lower() in ("true", "1", "yes")
        return obj.value

    @classmethod
    def set_value(cls, key: str, value) -> None:
        cls.objects.filter(key=key).update(value=str(value))
```

**Acceptance criteria:**
- `python manage.py makemigrations settings_manager` creates a migration file.

---

### Milestone 1.7 — Run migrations and load fixture

1. `python manage.py migrate` — all tables created.
2. Create `fixtures/initial_data.json` containing all rows specified in `docs/database-design.md` and `docs/alerting-rules.md`.
3. `python manage.py loaddata fixtures/initial_data.json` — succeeds.

**Acceptance criteria:**
- `python manage.py migrate` exits with code 0.
- Django admin at `http://localhost:8000/admin/` (after creating superuser) shows all 7 model types.
- `SystemSetting.objects.count()` returns 9 from Django shell.
- `AlertRule.objects.count()` returns 5.
- `WhatsAppRuntimeStatus.get_singleton().browser_ready` returns `False`.

---

### Milestone 1.8 — Register models in admin

In each app's `admin.py`, register all models with at least `list_display`. Full admin config for `alerting` as per `docs/alerting-rules.md`.

**Acceptance criteria:**
- All models visible in Django admin.
- `AlertRule` rows show `threshold_value` as editable column.

---

## Phase 2 — ML Engine Module

**Objective:** Wrap `StormPredictor` as a singleton loaded at Django startup.

**Reuse from Phase 1:** `src/predict.py` (the entire `StormPredictor` class).

---

### Milestone 2.1 — Create `ml_engine` module

**Files to create:**
```
ml_engine/__init__.py
ml_engine/apps.py
ml_engine/predictor.py
```

**`ml_engine/apps.py`:**
```python
from django.apps import AppConfig

class MlEngineConfig(AppConfig):
    name = "ml_engine"

    def ready(self):
        from ml_engine.predictor import initialize_predictor
        initialize_predictor()
```

**`ml_engine/predictor.py`:** Full implementation as specified in `docs/system-architecture.md`, Section "ML Engine Integration".

Add `"ml_engine"` to `INSTALLED_APPS` in `base.py`.

**Acceptance criteria:**
- `python manage.py runserver` startup log contains `INFO ml_engine StormPredictor loaded from ...` (using Python logging, not print).
- From Django shell:
  ```python
  from ml_engine.predictor import get_predictor
  p = get_predictor()
  assert p is not None
  result = p.add_reading({"timestamp": "2026-04-11T10:00:00", "pressure_hPa": 1010.0, "temperature_C": 20.0})
  assert result.get("status") == "buffering"
  ```
- After 4 `add_reading()` calls: result contains `storm_probability`, `prediction`, `risk_level`.
- If `STORM_MODEL_PATH` points to a nonexistent file: `get_predictor()` returns `None` and no exception propagates.

---

## Phase 3 — Sensor Ingest API

**Objective:** `POST /api/v1/readings/` — receive, validate, save, predict.

**Reuse from Phase 1:** `StormPredictor.add_reading()` via `ml_engine.predictor`.

---

### Milestone 3.1 — Serializer and API key auth

**Files to create:**
```
apps/sensor_ingest/serializers.py
apps/sensor_ingest/auth.py
```

**`serializers.py`:**
```python
from rest_framework import serializers
from .models import SensorReading
import re

class ReadingSerializer(serializers.Serializer):
    timestamp     = serializers.DateTimeField()
    pressure_hPa  = serializers.FloatField(min_value=900.0, max_value=1100.0)
    temperature_C = serializers.FloatField(min_value=-60.0, max_value=60.0)
    source        = serializers.ChoiceField(
        choices=["sensor", "simulator", "manual"],
        default="sensor",
        required=False
    )
```

**`auth.py`:** API key decorator as specified in `docs/api-spec.md`.

---

### Milestone 3.2 — Ingest view (without alerting, without channel layer)

**Files to create/modify:**
```
apps/sensor_ingest/views.py
apps/sensor_ingest/urls.py
storm_webapp/urls.py
```

**`views.py`:**

```python
import logging
from django.http import JsonResponse
from django.views import View
from django.utils.dateparse import parse_datetime
from .models import SensorReading
from .serializers import ReadingSerializer
from .auth import require_api_key
from apps.predictions.models import Prediction
from ml_engine.predictor import get_predictor

logger = logging.getLogger("sensor_ingest")

class ReadingIngestView(View):

    @require_api_key
    def post(self, request):
        import json
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        serializer = ReadingSerializer(data=data)
        if not serializer.is_valid():
            return JsonResponse({"error": "validation_failed", "detail": serializer.errors}, status=400)

        vd = serializer.validated_data
        ts = vd["timestamp"]

        # Reject duplicate timestamp
        if SensorReading.objects.filter(timestamp=ts).exists():
            return JsonResponse({
                "error": "duplicate_timestamp",
                "detail": f"A reading with timestamp {ts} already exists."
            }, status=409)

        reading = SensorReading.objects.create(
            timestamp=ts,
            pressure_hpa=vd["pressure_hPa"],
            temperature_c=vd["temperature_C"],
            source=vd.get("source", "sensor"),
        )

        prediction_data = None
        prediction_status = "ok"
        predictor = get_predictor()

        if predictor is None:
            prediction_status = "model_unavailable"
        else:
            result = predictor.add_reading({
                "timestamp": ts.isoformat(),
                "pressure_hPa": reading.pressure_hpa,
                "temperature_C": reading.temperature_c,
            })
            if result and result.get("status") != "buffering":
                pred_obj = Prediction.objects.create(
                    reading=reading,
                    storm_probability=result["storm_probability"],
                    prediction=result["prediction"],
                    risk_level=result["risk_level"],
                    decision_threshold=0.5,
                )
                prediction_data = {
                    "storm_probability": pred_obj.storm_probability,
                    "prediction": pred_obj.prediction,
                    "risk_level": pred_obj.risk_level,
                    "decision_threshold": pred_obj.decision_threshold,
                }
                result["db_id"] = pred_obj.id
            elif result and result.get("status") == "buffering":
                prediction_status = "buffering"

        return JsonResponse({
            "reading_id": reading.id,
            "prediction": prediction_data,
            "prediction_status": prediction_status,
            "alerts_triggered": 0,
            "status": prediction_status if prediction_status != "ok" else "ok",
        }, status=201)
```

Wire URL: `path("readings/", ReadingIngestView.as_view())` in `sensor_ingest/urls.py`.

Include in `storm_webapp/urls.py`.

**Acceptance criteria:**
- `POST /api/v1/readings/` with valid body and correct API key returns 201.
- `SensorReading` row exists in DB after the request.
- After 4 POSTs: response contains `prediction.storm_probability`, `prediction.risk_level`.
- `Prediction` row exists in DB linked to the reading.
- POST with missing `pressure_hPa` returns 400 with `validation_failed`.
- POST with wrong API key returns 401.
- POST with duplicate timestamp returns 409.
- POST with `model_unavailable` (delete/rename model file, restart server) still returns 201 with `prediction: null`.

---

### Milestone 3.3 — Readings history API

**File:** `apps/sensor_ingest/views.py` (add `ReadingListView`).

```python
class ReadingListView(View):
    def get(self, request):
        from datetime import timedelta
        from django.utils.timezone import now
        hours  = int(request.GET.get("hours", 24))
        limit  = int(request.GET.get("limit", 500))
        offset = int(request.GET.get("offset", 0))
        since  = now() - timedelta(hours=hours)
        qs = SensorReading.objects.filter(received_at__gte=since).order_by("timestamp")
        total = qs.count()
        readings = list(qs[offset:offset+limit].values(
            "id", "timestamp", "pressure_hpa", "temperature_c", "received_at", "source"
        ))
        # Rename columns to match API spec
        for r in readings:
            r["pressure_hPa"]  = r.pop("pressure_hpa")
            r["temperature_C"] = r.pop("temperature_c")
        return JsonResponse({"count": total, "readings": readings})
```

Add URL: `path("readings/", ReadingListView.as_view())` — GET goes to this view; use `dispatch` to route by method, or separate views.

**Acceptance criteria:**
- `GET /api/v1/readings/?hours=1` returns list of readings from last hour.
- Count matches number of readings in DB from that window.
- `pressure_hPa` and `temperature_C` keys present (not `pressure_hpa`).

---

## Phase 4 — Django Channels + WebSocket

**Objective:** Real-time push to browser on each sensor reading.

---

### Milestone 4.1 — Dashboard consumer

**Files to create:**
```
apps/dashboard/consumers.py
apps/dashboard/routing.py
```

**`consumers.py`:**
```python
from channels.generic.websocket import AsyncJsonWebsocketConsumer

class DashboardConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "dashboard"

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def sensor_update(self, event):
        await self.send_json(event)
```

**`routing.py`:**
```python
from django.urls import re_path
from .consumers import DashboardConsumer

websocket_urlpatterns = [
    re_path(r"ws/dashboard/$", DashboardConsumer.as_asgi()),
]
```

Update `storm_webapp/asgi.py` to import from this routing file (as specified in Milestone 0.3).

**Acceptance criteria:**
- `daphne storm_webapp.asgi:application` starts without error.
- Browser can connect to `ws://localhost:8000/ws/dashboard/` — check browser DevTools Network tab shows `101 Switching Protocols`.
- Disconnect and reconnect works without server-side error in logs.

---

### Milestone 4.2 — Wire channel layer to ingest view

**File to modify:** `apps/sensor_ingest/views.py`

Add to `ReadingIngestView.post()`, after saving reading and prediction:

```python
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

channel_layer = get_channel_layer()
async_to_sync(channel_layer.group_send)("dashboard", {
    "type": "sensor.update",
    "reading": {
        "id": reading.id,
        "timestamp": reading.timestamp.isoformat(),
        "pressure_hPa": reading.pressure_hpa,
        "temperature_C": reading.temperature_c,
    },
    "prediction": prediction_data,
    "prediction_status": prediction_status,
    "alerts": [],  # populated after Phase 5
})
```

**Acceptance criteria:**
- Open browser console on any page with a WebSocket connection.
- POST a sensor reading.
- Browser console shows the `sensor.update` JSON message within 1 second.
- `reading.pressure_hPa` and `prediction.risk_level` are present in the message.

---

## Phase 5 — Alert Rules Engine

**Objective:** Evaluate alert rules on each reading. Create `AlertEvent` rows. Enforce cooldown.

**Reuse from Phase 1:** Nothing directly. Logic based on `docs/alerting-rules.md`.

---

### Milestone 5.1 — Engine implementation (without WhatsApp dispatch)

**File to create:** `apps/alerting/engine.py`

Implement `AlertRulesEngine` class as specified in `docs/alerting-rules.md`, with `_dispatch_whatsapp` as a stub that does nothing:

```python
@classmethod
def _dispatch_whatsapp(cls, alert_events):
    pass  # Implemented in Phase 7
```

**File to create:** `apps/alerting/signals.py`

```python
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import AlertRule

@receiver(post_save, sender=AlertRule)
@receiver(post_delete, sender=AlertRule)
def invalidate_alert_rule_cache(sender, **kwargs):
    from .engine import AlertRulesEngine
    AlertRulesEngine.invalidate_cache()
```

Add signal import to `apps/alerting/apps.py`:
```python
class AlertingConfig(AppConfig):
    name = "apps.alerting"
    def ready(self):
        import apps.alerting.signals  # noqa
```

---

### Milestone 5.2 — Wire engine to ingest view

**File to modify:** `apps/sensor_ingest/views.py`

After saving prediction and before the channel layer send:

```python
from apps.alerting.engine import AlertRulesEngine

alert_result = {"prediction_with_id": result if result else None}
# Pass prediction dict enriched with db_id
prediction_for_engine = None
if prediction_data:
    prediction_for_engine = dict(prediction_data)
    prediction_for_engine["db_id"] = pred_obj.id
    prediction_for_engine["status"] = "ok"

alert_events = AlertRulesEngine.evaluate(reading, prediction_for_engine)
alerts_triggered = len(alert_events)
```

Update the channel layer send payload to include triggered alerts:
```python
"alerts": [
    {"id": e.id, "rule_type": e.rule_type, "severity": e.severity, "message": e.message}
    for e in alert_events
],
```

Update the HTTP response: `"alerts_triggered": alerts_triggered`.

---

### Milestone 5.3 — Alert history API

**Files to create:**
```
apps/alerting/views.py
apps/alerting/serializers.py
apps/alerting/urls.py
```

Implement `AlertEventListView` (GET, filter by hours/rule_type/severity/whatsapp_status) and `AlertRuleListView` / `AlertRuleDetailView` (GET + PATCH) as specified in `docs/api-spec.md`.

**Acceptance criteria (all of Milestone 5):**
- POST a reading with `pressure_hPa=985.0` (below 990 threshold) → `AlertEvent` created with `rule_type=PRESSURE_LOW`.
- `GET /api/v1/alerts/` returns that event.
- POST same low-pressure value within 30 minutes → no new `AlertEvent` created (cooldown).
- Post same value 31 minutes later (use a test with modified `created_at`) → new `AlertEvent` created.
- Post a reading with `storm_probability >= 0.80` (after buffer fills) → `AlertEvent` with severity=`HIGH`.
- If `storm_probability = 0.60` was last alert (MEDIUM), and now `storm_probability = 0.85` within cooldown → severity escalation fires anyway.
- `GET /api/v1/alert-rules/` returns all 5 rules.
- `PATCH /api/v1/alert-rules/3/` with `{"threshold_value": 985.0}` → threshold updated in DB; next evaluation uses 985.0.

---

## Phase 6 — Dashboard UI

**Objective:** Main dashboard page with live charts and risk card.

---

### Milestone 6.1 — Base template and dashboard view

**Files to create:**
```
templates/base.html
templates/dashboard/index.html
static/css/custom.css
apps/dashboard/views.py
apps/dashboard/urls.py
storm_webapp/urls.py  (add dashboard)
```

`base.html`: Bootstrap 5.3 CDN, Chart.js 4.x CDN, navbar with all page links, connection indicator dot, `{% block content %}`, `{% block extra_js %}`.

`DashboardView`: `TemplateView` passing threshold values from `SystemSetting` as context.

`custom.css`: Risk card colour transitions, WS dot styles (`.ws-dot`, `.ws-dot--green`, `.ws-dot--grey`), severity badge colours.

**Acceptance criteria:**
- `GET http://localhost:8000/` returns 200 with HTML.
- Page renders without JavaScript errors in browser console.
- Navbar shows all links.

---

### Milestone 6.2 — Chart.js charts and WebSocket client

**File:** `static/js/dashboard.js`

Implement:
- `initPressureChart(labels, data, highThreshold, lowThreshold)` — returns Chart.js instance.
- `initTemperatureChart(labels, data, highThreshold, lowThreshold)` — returns Chart.js instance.
- `loadInitialData()` — fetches `GET /api/v1/readings/?hours=24&limit=500` and `GET /api/v1/predictions/latest/` and `GET /api/v1/alerts/?limit=5`, then calls `initPressureChart`, `initTemperatureChart`, `updateRiskCard`, `renderRecentAlerts`.
- `appendChartPoint(pressureChart, temperatureChart, reading)` — appends point, shifts if > 500 points.
- `updateRiskCard(prediction, status)` — updates badge class and text.
- `connectWebSocket()` — connects, handles `sensor.update`, sets up auto-reconnect on close.
- `setConnectionIndicator(state)` — toggles dot class.

In `templates/dashboard/index.html`, in `{% block extra_js %}`:
```javascript
document.addEventListener("DOMContentLoaded", () => {
    loadInitialData();
    connectWebSocket();
});
```

Threshold values from Django context injected as JS constants:
```html
<script>
  const PRESSURE_HIGH = {{ pressure_high_threshold }};
  const PRESSURE_LOW  = {{ pressure_low_threshold }};
  const TEMP_HIGH     = {{ temperature_high_threshold }};
  const TEMP_LOW      = {{ temperature_low_threshold }};
</script>
```

**Acceptance criteria:**
- Dashboard page shows two Chart.js line charts populated with historical data.
- Threshold horizontal lines appear on both charts.
- Risk card shows current risk level with correct colour.
- POST a sensor reading → chart updates within 1 second without page reload.
- Risk card changes colour when risk level changes.
- Closing and reopening browser: WebSocket reconnects, charts reload from REST API.
- Recent alerts table shows last 5 events.

---

### Milestone 6.3 — Remaining HTML pages (skeleton level)

Create placeholder views and templates for:
- `/alerts/` → `AlertHistoryView` + `templates/dashboard/alerts.html`
- `/history/` → `SensorHistoryView` + `templates/dashboard/history.html`
- `/whatsapp/` → `WhatsAppStatusPageView` + `templates/whatsapp_integration/status.html`
- `/whatsapp/recipients/` → `RecipientsPageView` + `templates/whatsapp_integration/recipients.html`
- `/settings/` → `SettingsPageView` + `templates/settings_manager/settings.html`

Skeletons just need to extend `base.html` and render a heading. Full implementation in Phase 8–9.

**Acceptance criteria:**
- All 6 page URLs return 200.
- No broken links in navbar.

---

## Phase 7 — WhatsApp Sender Service

**Objective:** Implement the pywhatkit isolation layer. Wire it to the alerting engine.

---

### Milestone 7.1 — `WhatsAppSenderService`

**File to create:** `services/whatsapp_sender.py`

Full implementation as specified in `docs/whatsapp-integration.md`, Section 1.

**Acceptance criteria (unit-testable without browser):**
```python
# In Django shell with browser_ready=False:
from services.whatsapp_sender import WhatsAppSenderService
svc = WhatsAppSenderService()
result = svc.send_alert(phone="+923001234567", message="Test")
assert result.success == False
assert result.error == "Browser not ready"
# Check WhatsAppSendLog.objects.last().status == "MANUAL_CHECK_NEEDED"
```

---

### Milestone 7.2 — Wire `_dispatch_whatsapp` in engine

**File to modify:** `apps/alerting/engine.py`

Replace the stub `_dispatch_whatsapp` with full implementation from `docs/whatsapp-integration.md`, Section 1 ("Sending to Multiple Recipients").

Use background thread to avoid blocking HTTP response:

```python
import threading

@classmethod
def _dispatch_whatsapp(cls, alert_events):
    def _run():
        # full dispatch logic here
        pass
    t = threading.Thread(target=_run, daemon=True)
    t.start()
```

**Acceptance criteria:**
- `POST /api/v1/readings/` returns HTTP 201 immediately (does not block 20+ seconds).
- After the response returns, WhatsApp send is attempted in background thread.
- `WhatsAppSendLog` row created in DB within 30 seconds of the POST.
- When `whatsapp_alerts_enabled=false`: `AlertEvent.whatsapp_status` set to `SKIPPED`, no send attempt.
- When no active recipients: `AlertEvent.whatsapp_status` set to `SKIPPED`.
- When `browser_ready=True` and pywhatkit succeeds: `whatsapp_status=SENT`.
- When pywhatkit raises exception: `whatsapp_status=FAILED`, `WhatsAppSendLog.status=FAILED`, error logged.

---

## Phase 8 — WhatsApp Management Pages

**Objective:** Full WhatsApp status page, recipients CRUD, test send.

---

### Milestone 8.1 — WhatsApp status and set-ready API

**Files to create/modify:**
```
apps/whatsapp_integration/views.py
apps/whatsapp_integration/serializers.py
apps/whatsapp_integration/urls.py
templates/whatsapp_integration/status.html  (full implementation)
```

Implement all views and API endpoints for:
- `GET /api/v1/whatsapp/status/` — returns status object as per `docs/api-spec.md`.
- `POST /api/v1/whatsapp/status/set-ready/` — sets `browser_ready`.
- `GET /api/v1/whatsapp/send-log/?limit=10` — returns recent log.
- `GET /whatsapp/` page — full implementation per `docs/frontend-pages.md`, Page 3.

**Acceptance criteria:**
- `GET /api/v1/whatsapp/status/` returns `browser_ready`, `last_confirmed_at`, `stale_warning`.
- `POST /api/v1/whatsapp/status/set-ready/` with `{"ready": true, "confirmed_by": "Talha"}` → `browser_ready=True` in DB.
- `/whatsapp/` page shows READY/NOT READY status correctly.
- Status card is green when `browser_ready=True`, red when False.
- Stale warning (amber) when `browser_ready=True` and `last_confirmed_at` > 4 hours ago.
- Operational caveats box is always visible.

---

### Milestone 8.2 — Recipients management

**Files to create/modify:**
```
apps/whatsapp_integration/views.py  (add recipient views)
templates/whatsapp_integration/recipients.html  (full implementation)
```

Implement:
- `GET/POST /api/v1/whatsapp/recipients/`
- `PATCH/DELETE /api/v1/whatsapp/recipients/{id}/`
- `POST /api/v1/whatsapp/test-send/`
- `/whatsapp/recipients/` page — full implementation per `docs/frontend-pages.md`, Page 4.

**Acceptance criteria:**
- Adding a recipient via the form creates a DB row.
- Phone number `+923001234567` accepted; `0923001234567` rejected (must be E.164).
- Toggle active/inactive updates `WhatsAppRecipient.active`.
- Delete removes the row; send log rows are not deleted (FK SET NULL).
- Test send creates a `WhatsAppSendLog` row with `is_test=True`.
- Test send response arrives within 35 seconds (pywhatkit timeout).

---

### Milestone 8.3 — Retry alert send

**Files to create/modify:**
```
apps/alerting/views.py  (add AlertRetryView)
apps/alerting/urls.py   (add retry URL)
```

Implement `POST /api/v1/alerts/{id}/retry/` as per `docs/api-spec.md`.

**Acceptance criteria:**
- Retry endpoint on a `FAILED` event creates new `WhatsAppSendLog` rows.
- No new `AlertEvent` is created.
- Response includes per-recipient results.

---

## Phase 9 — Settings Page

**Objective:** UI and API for threshold and operational configuration.

---

### Milestone 9.1 — Settings API

**Files to create/modify:**
```
apps/settings_manager/views.py
apps/settings_manager/serializers.py
apps/settings_manager/urls.py
```

Implement `GET /api/v1/settings/` and `PUT /api/v1/settings/{key}/`.

**Acceptance criteria:**
- `GET /api/v1/settings/` returns all 9 settings.
- `PUT /api/v1/settings/pressure_low_threshold/` with `{"value": "985.0"}` → `SystemSetting` updated.
- `PUT` with `{"value": "notanumber"}` on a float key → 400.
- `PUT` on nonexistent key → 404.

---

### Milestone 9.2 — Settings page

**File to create:** `templates/settings_manager/settings.html`

Full implementation per `docs/frontend-pages.md`, Page 5.

**Acceptance criteria:**
- `/settings/` page loads all current values.
- Changing `storm_probability_threshold` to `0.50`, saving, then posting a reading with `storm_probability=0.55` → alert fires (threshold changed).
- Invalid float input shows validation error in the form.
- WhatsApp master toggle correctly updates `whatsapp_alerts_enabled`.

---

## Phase 10 — Alert History Page

**Objective:** Full alert history page with filtering and retry.

---

### Milestone 10.1 — Alert history page

**Files to create/modify:**
```
templates/dashboard/alerts.html  (full implementation)
static/js/alerts.js
```

Full implementation per `docs/frontend-pages.md`, Page 2.

**Acceptance criteria:**
- `/alerts/` shows all AlertEvent rows.
- Filter by `rule_type=PRESSURE_LOW` shows only pressure alerts.
- Filter by `hours=48` shows events from last 48 hours.
- `FAILED` events show a "Retry" button.
- Clicking Retry triggers the retry API and updates the badge in place.

---

## Phase 11 — Sensor Simulator and End-to-End Testing

**Objective:** Verify the full system with a script that mimics an ESP32.

---

### Milestone 11.1 — Sensor simulator

**File to create:** `tools/sensor_simulator.py`

```python
"""
Simulate ESP32 sensor readings for testing.
Usage: python tools/sensor_simulator.py [--url URL] [--mode normal|storm] [--interval 60] [--api-key KEY]
"""
import requests, time, random, argparse
from datetime import datetime, timezone

def simulate(url: str, api_key: str, interval: int, mode: str):
    session = requests.Session()
    session.headers.update({"X-API-Key": api_key, "Content-Type": "application/json"})
    pressure    = 1013.0
    temperature = 22.0

    while True:
        if mode == "storm":
            pressure    -= random.uniform(1.0, 3.0)
            temperature += random.uniform(-0.5, 0.5)
        elif mode == "cold":
            pressure    += random.uniform(-0.5, 0.5)
            temperature -= random.uniform(0.3, 1.0)
        else:
            pressure    += random.uniform(-0.5, 0.5)
            temperature += random.uniform(-0.3, 0.3)

        pressure    = max(960.0, min(1040.0, pressure))
        temperature = max(-20.0, min(50.0, temperature))

        payload = {
            "timestamp":     datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "pressure_hPa":  round(pressure, 2),
            "temperature_C": round(temperature, 2),
            "source":        "simulator",
        }

        try:
            resp = session.post(f"{url}/api/v1/readings/", json=payload, timeout=120)
            print(f"[{payload['timestamp']}] P={pressure:.1f} T={temperature:.1f} → {resp.status_code} | {resp.json().get('prediction_status','')}")
        except Exception as e:
            print(f"[ERROR] {e}")

        time.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url",      default="http://localhost:8000")
    parser.add_argument("--mode",     default="normal", choices=["normal", "storm", "cold"])
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--api-key",  default="change-me")
    args = parser.parse_args()
    simulate(args.url, args.api_key, args.interval, args.mode)
```

**Acceptance criteria:**
- Running `python tools/sensor_simulator.py --mode storm --interval 5` for 5 minutes:
  - At least 4 readings arrive (buffer fills).
  - Dashboard charts update in the browser.
  - After ~3–5 minutes of simulated pressure drop: `STORM_PROBABILITY` or `PRESSURE_LOW` alert fires.
  - `AlertEvent` row created in DB.
  - `WhatsAppSendLog` row created (status depends on `browser_ready`).
- Running with `--mode normal`: no alerts fire for at least 10 minutes.

---

## Completion Checklist

Before declaring Phase 2 complete, verify all of the following:

- [ ] `manage.py check` passes.
- [ ] `manage.py migrate` runs clean.
- [ ] All 6 app URL sets are connected in `storm_webapp/urls.py`.
- [ ] Sensor ingest API returns correct responses for all documented cases (201, 400, 401, 409).
- [ ] ML buffer warms up correctly after server restart (first 3 readings return `buffering`).
- [ ] Dashboard WebSocket reconnects automatically after server restart.
- [ ] Alert cooldown survives server restart (DB-backed).
- [ ] `WhatsAppSenderService` never raises exceptions.
- [ ] `WhatsAppRuntimeStatus.get_singleton()` always returns the single row.
- [ ] Settings page saves and takes effect on next reading.
- [ ] Sensor simulator in `storm` mode triggers at least one alert within 10 minutes.
- [ ] Retry endpoint creates new send log rows without duplicating alert events.
- [ ] All 6 HTML pages return 200 and render without JS console errors.
- [ ] No import of `pywhatkit` exists outside `services/whatsapp_sender.py`.
- [ ] No import of `src.predict` exists outside `ml_engine/predictor.py`.

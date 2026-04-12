# System Architecture
## Storm Prediction — Phase 2: Real-Time Django Web Application

---

## Assumptions

- Phase 1 ML code (`src/`) and trained model (`models/storm_model_v1.pkl`) exist and are functional.
- The Django project is created as a subdirectory of the existing repo: `storm_webapp/`.
- Local deployment means a single Windows/Linux desktop or laptop.
- The machine running Django is the same machine that runs Chrome with WhatsApp Web.
- Sensor readings arrive via HTTP POST from an ESP32 or a simulator script.
- Reading interval: every 10–60 minutes (configurable on the sensor side).
- No cloud deployment in Phase 2. LAN deployment is the furthest extent.
- A single operator manages the system.
- SQLite is the database for Phase 2. The schema is PostgreSQL-compatible for future migration.

---

## Repository Layout After Phase 2

```
storm_prediction/                        ← existing repo root (Phase 1)
│
├── src/                                 ← UNCHANGED — Phase 1 ML modules
│   ├── features.py
│   ├── labels.py
│   ├── predict.py                       ← StormPredictor class lives here
│   ├── train.py
│   ├── evaluate.py
│   ├── preprocessing.py
│   └── data_loader.py
│
├── models/
│   └── storm_model_v1.pkl               ← UNCHANGED — trained XGBoost model
│
├── data/                                ← UNCHANGED
├── notebooks/                           ← UNCHANGED
│
└── storm_webapp/                        ← NEW — Django project root
    ├── manage.py
    ├── requirements_webapp.txt
    ├── .env                             ← never commit
    ├── .env.example
    │
    ├── storm_webapp/                    ← Django project package
    │   ├── settings/
    │   │   ├── base.py
    │   │   ├── local.py
    │   │   └── production.py
    │   ├── urls.py
    │   ├── asgi.py
    │   └── wsgi.py
    │
    ├── apps/
    │   ├── sensor_ingest/
    │   ├── predictions/
    │   ├── alerting/
    │   ├── whatsapp_integration/
    │   ├── settings_manager/
    │   └── dashboard/
    │
    ├── ml_engine/                       ← internal module, not a Django app
    │   ├── __init__.py
    │   ├── apps.py
    │   └── predictor.py
    │
    ├── services/                        ← internal service layer, not Django apps
    │   ├── __init__.py
    │   └── whatsapp_sender.py
    │
    ├── templates/
    │   ├── base.html
    │   ├── dashboard/
    │   ├── whatsapp_integration/
    │   └── settings_manager/
    │
    ├── static/
    │   ├── css/custom.css
    │   └── js/
    │       ├── dashboard.js
    │       └── alerts.js
    │
    ├── fixtures/
    │   └── initial_data.json
    │
    └── tools/
        └── sensor_simulator.py
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LOCAL MACHINE (desktop / laptop)                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  Django + Daphne (ASGI server)                    │   │
│  │                                                                   │   │
│  │  ┌──────────────┐  POST /api/v1/readings/                        │   │
│  │  │ ESP32 /      │ ──────────────────────► sensor_ingest app      │   │
│  │  │ Simulator    │                              │                  │   │
│  │  └──────────────┘                    ┌─────────┼──────────┐      │   │
│  │                                      ▼         ▼          ▼      │   │
│  │                               ml_engine   alerting   channel     │   │
│  │                               predictor   engine     layer       │   │
│  │                                  │           │          │        │   │
│  │                                  ▼           ▼          ▼        │   │
│  │                            Prediction   AlertEvent   Dashboard   │   │
│  │                            saved to DB  saved to DB  Consumer    │   │
│  │                                              │          │        │   │
│  │                                              ▼          ▼        │   │
│  │                                       WhatsApp    WebSocket      │   │
│  │                                       Sender      → Browser      │   │
│  │                                       Service                    │   │
│  │                                              │                   │   │
│  │                                              ▼                   │   │
│  │                                       pywhatkit                  │   │
│  │                                              │                   │   │
│  └──────────────────────────────────────────────┼───────────────────┘   │
│                                                 │                        │
│  ┌──────────────────┐          ┌────────────────▼──────────────────┐    │
│  │   SQLite DB      │          │  Chrome (must stay open)           │    │
│  │   db.sqlite3     │          │  ┌─────────────────────────────┐  │    │
│  └──────────────────┘          │  │  WhatsApp Web tab (logged in)│  │    │
│                                │  └─────────────────────────────┘  │    │
│  ┌──────────────────┐          └───────────────────────────────────┘    │
│  │   Browser        │                                                    │
│  │  Dashboard UI    │                                                    │
│  │  ws://localhost  │                                                    │
│  └──────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Django Apps and Responsibilities

| App | Package path | Responsibility |
|-----|-------------|----------------|
| `sensor_ingest` | `apps.sensor_ingest` | Receive, validate, and store sensor readings; trigger ML and alerting |
| `predictions` | `apps.predictions` | Store and expose prediction history; no ML logic |
| `alerting` | `apps.alerting` | Evaluate alert rules; create alert events; dispatch to WhatsApp sender |
| `whatsapp_integration` | `apps.whatsapp_integration` | Recipient management; runtime status; send log UI |
| `settings_manager` | `apps.settings_manager` | Threshold and operational config stored in DB |
| `dashboard` | `apps.dashboard` | All HTML page views; WebSocket consumer |

## Internal Modules (not Django apps)

| Module | Path | Responsibility |
|--------|------|----------------|
| `ml_engine` | `ml_engine/` | Singleton `StormPredictor` wrapper; loaded once at startup via `AppConfig.ready()` |
| `whatsapp_sender` | `services/whatsapp_sender.py` | All `pywhatkit` calls; isolated here exclusively |

---

## ML Engine Integration

The existing `StormPredictor` from `src/predict.py` is used without modification.

**Singleton loading:**

```python
# ml_engine/apps.py
class MlEngineConfig(AppConfig):
    name = "ml_engine"
    def ready(self):
        from ml_engine.predictor import initialize_predictor
        initialize_predictor()
```

```python
# ml_engine/predictor.py
import sys
from pathlib import Path
from django.conf import settings

# Ensure src/ is importable
sys.path.insert(0, str(Path(settings.BASE_DIR).parent))

from src.predict import StormPredictor

PREDICTOR: StormPredictor | None = None

def initialize_predictor():
    global PREDICTOR
    try:
        PREDICTOR = StormPredictor(model_path=settings.STORM_MODEL_PATH)
    except Exception as e:
        import logging
        logging.getLogger("ml_engine").error(f"Failed to load model: {e}")
        PREDICTOR = None

def get_predictor():
    return PREDICTOR
```

**Buffer state note:** The `StormPredictor` maintains an in-memory `deque` buffer. On Django restart, this buffer is empty. The first 3 readings after restart return `{"status": "buffering"}`. This is expected behaviour and is surfaced in the API response and on the dashboard.

**`src/predict.py` returns on a valid prediction:**
```json
{
  "storm_probability": 0.83,
  "prediction": 1,
  "risk_level": "HIGH"
}
```

**`src/predict.py` returns when buffering:**
```json
{
  "status": "buffering",
  "readings": 2
}
```

---

## Real-Time Transport

Django Channels 4.x is used for WebSocket communication.

- Channel layer: `InMemoryChannelLayer` for local/single-worker deployment.
- Channel group name: `"dashboard"`.
- `DashboardConsumer` (async): joins group on connect, leaves on disconnect, forwards `sensor.update` events to browser.
- The ingest view calls `async_to_sync(channel_layer.group_send)` synchronously after saving a reading.
- The browser WebSocket client reconnects automatically on disconnect (3-second retry).

**ASGI routing:**
```python
# storm_webapp/asgi.py
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

**Single worker constraint:** Because `PREDICTOR` is a module-level singleton, the ASGI server must run as a **single process**. Use:
```
daphne -p 8000 storm_webapp.asgi:application
```
Do not use multi-worker gunicorn with this predictor design.

---

## Request Flow — Sensor Reading Arrives

```
1. ESP32 or simulator sends:
   POST /api/v1/readings/
   Headers: X-API-Key: <key>
   Body: { "timestamp": "...", "pressure_hPa": 1005.2, "temperature_C": 28.1 }

2. sensor_ingest/views.py:ReadingIngestView
   a. Validates payload (400 if invalid)
   b. Checks API key (401 if missing or wrong)
   c. Rejects duplicate timestamps (409 if same timestamp already in DB)
   d. Saves SensorReading to DB

3. Calls ml_engine.predictor.get_predictor().add_reading(reading_dict)
   a. Returns prediction dict, or {"status": "buffering"}, or None if model not loaded

4. If valid prediction:
   a. Saves Prediction row linked to SensorReading

5. Calls alerting.engine.AlertRulesEngine.evaluate(reading, prediction_or_none)
   a. Checks each active AlertRule
   b. Creates AlertEvent rows for triggered rules that pass cooldown
   c. Dispatches WhatsApp sends via services.whatsapp_sender

6. Calls channel_layer.group_send("dashboard", sensor_update_payload)
   a. DashboardConsumer forwards to all connected browser clients

7. Returns HTTP 201 with:
   { "reading_id": int, "prediction": {...}|null, "alerts_triggered": int }
```

---

## Settings Architecture

Settings are split into two layers:

**Environment / deploy-time settings** (`settings/base.py` loaded from `.env`):
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `STORM_MODEL_PATH`, `SENSOR_API_KEY`

**Runtime operational settings** (`SystemSetting` DB table):
- Alert thresholds, cooldown minutes, master WhatsApp enable/disable switch, buffer size
- Readable and writable from the `/settings/` UI page and `GET/PUT /api/v1/settings/`
- Cached in memory for 60 seconds to avoid per-request DB queries

---

## Deployment Stack

| Component | Tool | Notes |
|-----------|------|-------|
| ASGI server | Daphne 4.x | Single process; required for channel layer and predictor singleton |
| Web framework | Django 5.x | |
| Real-time | Django Channels 4.x | InMemoryChannelLayer; switch to Redis layer for LAN multi-client |
| Database | SQLite | File at `storm_webapp/db.sqlite3`; PostgreSQL-ready schema |
| ML runtime | XGBoost + joblib | Loaded once at startup |
| WhatsApp | pywhatkit 5.4+ | Requires Chrome + WhatsApp Web session on same machine |
| Browser | Chrome / Chromium | Must remain open with WhatsApp Web logged in |
| Python | 3.11+ | |
| OS | Windows 10/11 or Ubuntu Desktop | Must have GUI for pywhatkit |

---

## Dependency Boundaries

```
sensor_ingest  →  ml_engine.predictor          (reads prediction)
sensor_ingest  →  alerting.engine              (triggers rule evaluation)
sensor_ingest  →  channel_layer                (pushes WebSocket event)
alerting       →  services.whatsapp_sender     (dispatches WhatsApp)
alerting       →  settings_manager.models      (reads thresholds)
whatsapp_sender → pywhatkit                    (ONLY here)
dashboard      →  channel_layer                (receives WebSocket events)
ml_engine      →  src.predict                  (ONLY here; no other app imports src/)

FORBIDDEN IMPORTS:
- Any app importing pywhatkit directly
- Any app importing src.predict directly
- dashboard importing from alerting
- ml_engine importing from any app
```

---

## What Is Reused from Phase 1

| Asset | Reuse method |
|-------|-------------|
| `src/features.py` | Called by `StormPredictor` inside `src/predict.py`; not called by Django directly |
| `src/predict.py` | Imported exclusively by `ml_engine/predictor.py` |
| `models/storm_model_v1.pkl` | Path set in `STORM_MODEL_PATH` env var; loaded by `StormPredictor.__init__` |
| `src/labels.py`, `src/train.py`, `src/evaluate.py` | Not used by web app; remain available for offline retraining |
| `FEATURE_COLS` list in `src/predict.py` | Must not change; model was trained against these exact names |
| `RISK_THRESHOLDS` dict in `src/predict.py` | Used as-is; LOW/MEDIUM/HIGH classification unchanged |

---

## What Is New in Phase 2

- `storm_webapp/` Django project (all of it)
- `ml_engine/` singleton wrapper
- `services/whatsapp_sender.py` pywhatkit isolation
- All 6 Django apps
- SQLite database with 8 tables
- REST API (10 endpoint groups)
- WebSocket endpoint
- All HTML templates and JavaScript
- Alert rules engine
- Sensor simulator tool (`tools/sensor_simulator.py`)

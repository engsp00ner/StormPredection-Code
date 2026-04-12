# Storm Prediction System — Technical Blueprint

> **Document Version:** 2.0.0
> **Updated:** 2026-04-11
> **Phase 1:** Complete — Offline ML Training Pipeline
> **Phase 2:** Design Complete — Django Real-Time Web Application
> **Phase 3:** Planned — MQTT Streaming, BME280, Rain/Wind Sensors

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Evolution Summary](#2-system-evolution-summary)
3. [Current Tech Stack](#3-current-tech-stack)
4. [Updated Repository / Folder Structure](#4-updated-repository--folder-structure)
5. [Current System Architecture](#5-current-system-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Real-Time Data Flow](#8-real-time-data-flow)
9. [Database Blueprint](#9-database-blueprint)
10. [API Blueprint](#10-api-blueprint)
11. [Alerting and Rule Engine](#11-alerting-and-rule-engine)
12. [WhatsApp Integration Architecture](#12-whatsapp-integration-architecture)
13. [Configuration and Environment](#13-configuration-and-environment)
14. [Deployment / Runtime Architecture](#14-deployment--runtime-architecture)
15. [Key End-to-End Flows](#15-key-end-to-end-flows)
16. [Operational Runbook Summary](#16-operational-runbook-summary)
17. [Risks, Constraints, and Known Limitations](#17-risks-constraints-and-known-limitations)
18. [What Was Reused vs Newly Built](#18-what-was-reused-vs-newly-built)
19. [Future Enhancements](#19-future-enhancements)
20. [Change Summary](#20-change-summary)

---

## 1. Project Overview

### What the System Does

The **Storm Prediction System** is a multi-phase platform that ingests atmospheric sensor readings, engineers meteorological features, runs a trained binary storm classifier, and delivers real-time storm risk predictions with automated WhatsApp alerting.

The system is purpose-built for a **multi-phase roadmap**:

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Offline ML training pipeline + local JSON inference | **Complete** |
| **Phase 2** | Real-time Django web application with ESP32 integration, live dashboard, alerting, and WhatsApp notifications | **Design Complete** |
| **Phase 3** | BME280 upgrade (adds humidity), rain/wind sensors, MQTT streaming pipeline | Planned |

### Business / Domain Purpose

The domain is **operational meteorology at the edge**. The end goal is a low-cost, deployable IoT-to-prediction system that:

- Reads atmospheric sensor data from a BMP280/BME280 chip on an ESP32 microcontroller
- Detects barometric signatures of approaching storms 3 hours in advance
- Issues a binary storm alert with a probability score and a risk level (`LOW`, `MEDIUM`, `HIGH`)
- Delivers alerts via WhatsApp to configured recipients
- Presents live sensor data and predictions on a browser dashboard

The project replaces expensive professional weather station setups with a sub-$10 hardware component backed by a trained XGBoost model.

### Main Actors / Users

| Actor | Role |
|-------|------|
| **Data Scientist / ML Engineer** | Runs the training pipeline, tunes models, evaluates performance |
| **Operator** | Manages the live system: starts the server, confirms WhatsApp readiness, manages recipients and alert thresholds |
| **ESP32 Microcontroller** | Pushes sensor readings to the Django ingest API every 10–60 minutes |
| **Alert Recipients** | Receive WhatsApp messages when storm conditions are detected |
| **Dashboard Viewer** | Monitors live pressure/temperature charts and prediction state in a browser |

### Main Modules / Business Areas

**Phase 1 (complete):**
1. Data Ingestion — load raw CSV or generate synthetic weather data
2. Preprocessing — clean, sort, clip, and fill gaps in time-series sensor data
3. Feature Engineering — derive lag, delta, and rolling statistical features
4. Label Generation — create binary storm labels using pressure-drop weak supervision
5. Model Training — time-aware XGBoost classifier with class-imbalance handling
6. Model Evaluation — Precision, Recall, F1, ROC-AUC, PR-AUC, optimal threshold selection
7. Hyperparameter Tuning — grid search over 1,296 XGBoost parameter combinations
8. Local Inference — rolling-buffer prediction from JSON sensor readings

**Phase 2 (designed):**
9. Sensor Ingest API — validated HTTP POST endpoint for ESP32 readings
10. Real-Time Predictions — live ML inference via singleton `StormPredictor`
11. WebSocket Dashboard — live pressure/temperature charts and prediction risk card
12. Alerting Engine — rule-based threshold + ML probability alerting with cooldown
13. WhatsApp Notification — pywhatkit-based sequential message dispatch
14. Recipient Management — operator-controlled recipient list with E.164 validation
15. Settings Manager — in-DB configurable thresholds and operational switches

---

## 2. System Evolution Summary

### What Changed Between v1.0 and v2.0 of This Blueprint

**v1.0 (Phase 1 only):**
- No web framework, no database, no frontend, no API
- Entirely CLI-driven pipeline
- Phase 2 and 3 described as "planned" with rough architectural notes

**v2.0 (Phase 2 designed):**
- Django 5.x web application designed in full
- Six Django apps, two internal modules, one service module
- 8-table SQLite database with full schema
- Complete REST API specification (15+ endpoints)
- WebSocket real-time transport via Django Channels 4.x
- 6-page browser frontend with Bootstrap + Chart.js
- Alert rules engine with severity escalation and cooldown
- WhatsApp integration via pywhatkit with explicit limitations documented
- Environment/configuration split into deploy-time (`.env`) and runtime (DB settings)
- Operational runbook and execution roadmap for Codex

### Key Architectural Decisions Made in Phase 2

| Decision | Rationale |
|----------|-----------|
| Single-process Daphne (no multi-worker) | ML predictor singleton lives in-process; multi-worker would give each process an empty separate buffer |
| pywhatkit isolated exclusively in `services/whatsapp_sender.py` | Browser automation is fragile; containment allows replacement without touching any other module |
| `AppConfig.ready()` for ML model loading | Guarantees model is loaded once at startup; prevents race conditions |
| `InMemoryChannelLayer` (not Redis) for Phase 2 | Single-process deployment; no external Redis dependency for local LAN use |
| DB-backed cooldown (not in-memory) | Survives server restarts; consistent across the process lifetime |
| Background thread for WhatsApp dispatch | pywhatkit blocks for ~20–30s per recipient; HTTP response must not be held |
| `alert_events` denormalizes `rule_type` and `threshold_value` | Historical accuracy even if rule configuration is later changed |

---

## 3. Current Tech Stack

### Phase 1 Stack (operational)

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | Python 3.11+ | All ML logic |
| ML Classifier | XGBoost | Primary storm binary classifier |
| ML Utilities | scikit-learn | Metrics, preprocessing utilities |
| Data Manipulation | pandas | DataFrame operations, time-series resampling |
| Numerical Computing | numpy | Vectorised array operations, synthetic data generation |
| Model Persistence | joblib | Serialize/deserialize `.pkl` model files |
| Configuration | PyYAML (`config.yaml`) | Path and threshold config (currently not wired to runtime; aspirational) |
| Testing | Python `unittest` / pytest | Unit and integration tests |
| Environment | Python venv (`Storm-venv/`) | Dependency isolation |
| Data Format — Training | CSV | Training, processed, and labeled datasets |
| Data Format — Inference | JSON | Live sensor input / local inference |

### Phase 2 Stack (designed)

| Layer | Technology | Notes |
|-------|------------|-------|
| Web Framework | Django 5.x | Apps-based modular structure |
| ASGI Server | Daphne 4.x | Single process; required for Channels and predictor singleton |
| Real-Time | Django Channels 4.x | WebSocket; `InMemoryChannelLayer` for local deployment |
| REST API | Django REST Framework 3.15+ | All data API endpoints |
| Database | SQLite (dev) / PostgreSQL-compatible | File at `storm_webapp/db.sqlite3` |
| ML Runtime | XGBoost + joblib | Loaded once at startup via `AppConfig.ready()` |
| WhatsApp | pywhatkit 5.4+ | Browser automation; requires Chrome + WhatsApp Web session |
| Browser Automation | pyautogui (pywhatkit dependency) | Presses Enter to send message; requires unlocked display |
| Frontend CSS | Bootstrap 5.3 (CDN) | No npm build step |
| Frontend Charts | Chart.js 4.x (CDN) | No npm build step |
| Frontend JS | Vanilla JavaScript | No React, Vue, or jQuery |
| Configuration | python-decouple | `.env` file parsing in `settings/base.py` |
| Python | 3.11+ | |
| OS | Windows 10/11 or Ubuntu Desktop | Must have GUI for pywhatkit |

---

## 4. Updated Repository / Folder Structure

```
StormPredection-Code/                    ← repo root
│
├── src/                                 ← PHASE 1 — ML modules (NEVER MODIFIED in Phase 2)
│   ├── __init__.py
│   ├── constants.py                     ← FEATURE_COLS, REQUIRED_COLUMNS, RISK_THRESHOLDS
│   ├── data_loader.py
│   ├── preprocessing.py
│   ├── features.py
│   ├── labels.py
│   ├── train.py
│   ├── evaluate.py
│   ├── predict.py                       ← StormPredictor class — imported by ml_engine only
│   └── tune.py
│
├── models/
│   ├── storm_model_v1.pkl               ← PRIMARY model used in Phase 2 (NEVER MODIFIED)
│   ├── storm_model.pkl                  ← Tuned model (53 KB)
│   ├── storm_model_default.pkl          ← Baseline model (81 KB)
│   └── model_metadata.json             ← decision_threshold=0.7, metrics, features list
│
├── data/                                ← PHASE 1 — CSV data pipeline stages
│   ├── raw/
│   │   └── weather_raw.csv
│   ├── processed/
│   │   ├── weather_clean.csv
│   │   ├── weather_features.csv
│   │   └── weather_labeled.csv
│   └── StormEvents_*.csv               ← NOAA reference data (not wired into pipeline)
│
├── app/
│   └── local_infer.py                  ← PHASE 1 — CLI JSON inference wrapper
│
├── tests/                              ← PHASE 1 — Unit / integration tests
│   ├── test_features.py
│   ├── test_labels.py
│   └── test_predict.py
│
├── old-docs/                           ← Original Phase 1 specification documents
│   ├── storm-predection.md
│   ├── Task_BreakDown.md
│   ├── DATA_SCHEMA.md
│   ├── ACCEPTANCE_CRITERIA.md
│   ├── MODEL_REQUIREMENTS.md
│   └── My_dev_rules.md
│
├── docs/                               ← PHASE 2 — Implementation design documents
│   ├── system-architecture.md
│   ├── database-design.md
│   ├── api-spec.md
│   ├── frontend-pages.md
│   ├── whatsapp-integration.md
│   ├── alerting-rules.md
│   ├── codex-roadmap.md
│   ├── env-template.md
│   └── operational-runbook.md
│
├── storm_webapp/                        ← PHASE 2 — Django project root (new)
│   ├── manage.py
│   ├── requirements_webapp.txt
│   ├── .env                             ← never commit
│   ├── .env.example
│   │
│   ├── storm_webapp/                    ← Django project package
│   │   ├── settings/
│   │   │   ├── base.py                  ← env vars + INSTALLED_APPS + CHANNEL_LAYERS
│   │   │   ├── local.py                 ← DEBUG=True; imports base
│   │   │   └── production.py
│   │   ├── urls.py                      ← root URL conf
│   │   ├── asgi.py                      ← ProtocolTypeRouter (HTTP + WebSocket)
│   │   └── wsgi.py
│   │
│   ├── apps/
│   │   ├── sensor_ingest/               ← Receive, validate, store readings; trigger ML + alerts
│   │   ├── predictions/                 ← Store and expose prediction history
│   │   ├── alerting/                    ← Rule evaluation, AlertEvent creation, WhatsApp dispatch
│   │   ├── whatsapp_integration/        ← Recipients, runtime status, send log UI
│   │   ├── settings_manager/            ← DB-backed operational thresholds
│   │   └── dashboard/                   ← All HTML views + WebSocket consumer
│   │
│   ├── ml_engine/                       ← Singleton StormPredictor wrapper (not a Django app)
│   │   ├── __init__.py
│   │   ├── apps.py                      ← AppConfig.ready() → initialize_predictor()
│   │   └── predictor.py                 ← PREDICTOR global; get_predictor(); initialize_predictor()
│   │
│   ├── services/                        ← Service layer (not Django apps)
│   │   ├── __init__.py
│   │   └── whatsapp_sender.py           ← ALL pywhatkit calls live here exclusively
│   │
│   ├── templates/
│   │   ├── base.html                    ← Shared layout: navbar, CDN links, WS indicator
│   │   ├── dashboard/
│   │   │   ├── index.html               ← Main dashboard (risk card + charts + alerts)
│   │   │   ├── alerts.html              ← Alert history with filters and retry
│   │   │   └── history.html             ← Sensor data history + CSV export
│   │   ├── whatsapp_integration/
│   │   │   ├── status.html              ← WhatsApp readiness management
│   │   │   └── recipients.html          ← Recipient CRUD
│   │   └── settings_manager/
│   │       └── settings.html            ← Threshold editing form
│   │
│   ├── static/
│   │   ├── css/custom.css
│   │   └── js/
│   │       ├── dashboard.js             ← Chart.js, WebSocket, risk card
│   │       └── alerts.js                ← Alert table, retry, pagination
│   │
│   ├── fixtures/
│   │   └── initial_data.json            ← Seeds: 5 AlertRules, 9 SystemSettings, 1 WhatsAppRuntimeStatus
│   │
│   └── tools/
│       └── sensor_simulator.py          ← Simulates ESP32 readings for local testing
│
├── config.yaml                          ← PHASE 1 only; not read by Phase 2
├── requirements.txt                     ← PHASE 1 ML dependencies
├── sample_input.json                    ← Example inference input
├── blue_print.md                        ← Original v1.0 blueprint (Phase 1 only)
├── blue_print_updated.md                ← This document
└── README.md
```

---

## 5. Current System Architecture

### Architecture Overview

The system has two distinct layers:

**Phase 1 layer** — a linear, stateless data pipeline: `data_loader → preprocessing → features → labels → train → evaluate`. No server, no database, no web layer. Execution is CLI-driven.

**Phase 2 layer** — a synchronous Django + Channels ASGI web application. The ML engine is embedded as a startup-loaded singleton. Sensor readings arrive via HTTP POST, trigger ML inference, alert evaluation, and real-time WebSocket broadcast simultaneously.

### Component Diagram

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
│  │                                       (thread)                   │   │
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

### Django Apps and Responsibilities

| App | Package path | Responsibility |
|-----|-------------|----------------|
| `sensor_ingest` | `apps.sensor_ingest` | Receive, validate, and store sensor readings; trigger ML and alerting |
| `predictions` | `apps.predictions` | Store and expose prediction history; no ML logic |
| `alerting` | `apps.alerting` | Evaluate alert rules; create alert events; dispatch to WhatsApp sender |
| `whatsapp_integration` | `apps.whatsapp_integration` | Recipient management; runtime status; send log UI |
| `settings_manager` | `apps.settings_manager` | Threshold and operational config stored in DB |
| `dashboard` | `apps.dashboard` | All HTML page views; WebSocket consumer |

### Internal Modules (not Django apps)

| Module | Path | Responsibility |
|--------|------|----------------|
| `ml_engine` | `ml_engine/` | Singleton `StormPredictor` wrapper; loaded once at startup via `AppConfig.ready()` |
| `whatsapp_sender` | `services/whatsapp_sender.py` | All `pywhatkit` calls; isolated here exclusively |

### Dependency Boundaries

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

## 6. Backend Architecture

### Phase 1 Backend — ML Pipeline

The Phase 1 backend is a sequence of standalone Python modules. Each is a pure function consuming a DataFrame and producing a DataFrame or artifact. There is no server, no shared state between invocations, and no inter-process communication.

| Script | CLI Entry | Key Function |
|--------|-----------|--------------|
| `src/data_loader.py` | `python src/data_loader.py --source synthetic --output data/raw/weather_raw.csv` | `load_data()` / `generate_synthetic_weather_data()` |
| `src/preprocessing.py` | `python src/preprocessing.py --input ... --output ...` | `preprocess_data()` |
| `src/features.py` | `python src/features.py --input ... --output ...` | `generate_features()` |
| `src/labels.py` | `python src/labels.py --input ... --output ... --horizon 3` | `create_labels()` |
| `src/train.py` | `python src/train.py --data ... --output ...` | `train()` |
| `src/evaluate.py` | `python src/evaluate.py --model ... --data ...` | `evaluate_model()` |
| `src/tune.py` | `python src/tune.py --data ... --output ...` | `tune_model()` |
| `app/local_infer.py` | `python app/local_infer.py --model ... --input sample_input.json` | `predict_from_payload()` |

#### Core Module Responsibilities

**`src/constants.py`** — Central registry: `FEATURE_COLS` (16 names), `REQUIRED_COLUMNS`, `RISK_THRESHOLDS`. Every other module imports from here. Never modify without retraining.

**`src/preprocessing.py`** — `preprocess_data()`: sort → dedup → clip (pressure 900–1100 hPa, temperature -60–60°C) → resample to regular frequency → forward-fill gaps (max 2 steps) → drop remaining NaN.

**`src/features.py`** — `generate_features()`: computes all 16 features in `FEATURE_COLS`. Feature groups: raw values, lag (1h/2h/3h), delta, pressure tendency (hPa/h), rolling mean/std/min over 3h window, hour-of-day, month. No future data used — all operations look backward only.

**`src/labels.py`** — `create_labels()`: For each row, if `pressure[i] - min(pressure[i+1..i+3]) > 3.0 hPa`, label = 1. Last 3 rows set to `pd.NA` (no future data). Meteorological basis: a 3 hPa drop in 3 hours is the classical barometric storm warning threshold.

**`src/train.py`** — `train()`: time-aware 80/20 split, `scale_pos_weight = negatives/positives ≈ 95.6` for class imbalance, XGBoost with 300 estimators early-stopped on `aucpr`. Calls `select_decision_threshold()` on validation probabilities. Saves model + `model_metadata.json`.

**`src/predict.py`** — `StormPredictor` class: holds a `deque(maxlen=12)` buffer. `add_reading(dict)` appends to buffer; returns `{"status": "buffering"}` if buffer < 4 readings, otherwise calls `generate_features()` on buffer frame, extracts latest row, calls `model.predict_proba()`, returns `{storm_probability, prediction, risk_level, decision_threshold}`.

**Current model performance:** Precision 0.571, Recall 0.154, F1 0.242, ROC-AUC 0.875, Decision threshold 0.70.

### Phase 2 Backend — Django Application

#### ML Engine Singleton

The existing `StormPredictor` is loaded once at Django startup via `AppConfig.ready()`:

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

sys.path.insert(0, str(Path(settings.BASE_DIR).parent))  # makes src/ importable

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

**Buffer state behaviour:** After every server restart, the `StormPredictor` buffer is empty. The first 3 readings after restart return `{"status": "buffering"}`. This is expected, surfaced in the API response, and shown on the dashboard as "BUFFERING".

**Single-process constraint:** Because `PREDICTOR` is a module-level singleton, the ASGI server must run as a **single process**: `daphne -p 8000 storm_webapp.asgi:application`. Multi-worker gunicorn is forbidden — each worker would maintain its own separate empty buffer.

#### Sensor Ingest View

The critical path that runs on every reading arrival:

1. Validate payload — field presence, type coercion, physical bounds clipping (pressure 900–1100, temp -60–60)
2. Check `X-API-Key` header
3. Reject duplicate timestamps (HTTP 409)
4. Save `SensorReading` to DB
5. Call `get_predictor().add_reading(reading_dict)` → prediction dict or buffering or None
6. Save `Prediction` row if prediction is not None and not buffering
7. Call `AlertRulesEngine.evaluate(reading, prediction)` → list of `AlertEvent` rows
8. If any `AlertEvent` created: dispatch WhatsApp in a background thread
9. Call `channel_layer.group_send("dashboard", sensor_update_payload)`
10. Return HTTP 201 with `{reading_id, prediction, alerts_triggered}`

```python
# In sensor_ingest/views.py (simplified)
import threading

if alert_events:
    t = threading.Thread(
        target=_dispatch_whatsapp,
        args=(alert_events,),
        daemon=True
    )
    t.start()
```

The background thread prevents pywhatkit's 20–30s blocking calls from holding the HTTP response.

#### Settings Architecture

Settings are split into two layers:

**Deploy-time settings** (`settings/base.py` loaded from `.env`):
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `STORM_MODEL_PATH`, `SENSOR_API_KEY`

**Runtime operational settings** (`SystemSetting` DB table):
- Alert thresholds, cooldown minutes, master WhatsApp enable/disable switch, buffer size
- Readable and writable from the `/settings/` UI page and `GET/PUT /api/v1/settings/`
- Cached in memory for 60 seconds to avoid per-request DB queries

#### ASGI Configuration

```python
# storm_webapp/asgi.py
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

WebSocket routing (`apps/dashboard/routing.py`):
```python
websocket_urlpatterns = [
    re_path(r"ws/dashboard/$", DashboardConsumer.as_asgi()),
]
```

#### Authentication

| Endpoint | Auth Method |
|----------|-------------|
| `POST /api/v1/readings/` | `X-API-Key` header; value must match `SENSOR_API_KEY` env var |
| All other REST endpoints | LAN access control only (no login in Phase 2) |
| WebSocket `/ws/dashboard/` | No auth in Phase 2 |
| `/admin/` | Django admin session auth |

```python
# apps/sensor_ingest/auth.py
def require_api_key(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        key = request.headers.get("X-API-Key", "")
        if key != settings.SENSOR_API_KEY:
            return JsonResponse({"error": "invalid_api_key"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper
```

---

## 7. Frontend Architecture

### Design Approach

- **Django Templates** — server-side rendering. No SPA framework.
- **Bootstrap 5.3** — loaded from CDN. No npm build step.
- **Chart.js 4.x** — loaded from CDN.
- **Vanilla JavaScript** — no React, Vue, or jQuery.
- Initial page data fetched via `fetch()` after DOM ready, calling the REST API.
- WebSocket connection established on the dashboard page only.
- No login required in Phase 2 (LAN access control assumed).

### Base Template (`templates/base.html`)

Defines shared layout for all pages:
- `<head>`: Bootstrap 5 CSS CDN, Chart.js CDN, `custom.css`, `{% block extra_head %}`
- Top navbar: Brand "Storm Prediction", links to Dashboard / Alerts / WhatsApp / Recipients / Settings, live connection indicator dot (green=WebSocket open, grey=closed)
- `<main>`: `{% block content %}`
- `<footer>`: "Storm Prediction System — Local Deployment" + server time
- End of body: `{% block extra_js %}`

### Pages

| Page | URL | Template | Description |
|------|-----|----------|-------------|
| Dashboard | `/` | `dashboard/index.html` | Risk card, pressure/temp charts, recent alerts |
| Alert History | `/alerts/` | `dashboard/alerts.html` | Filterable alert table with retry button |
| Sensor History | `/history/` | `dashboard/history.html` | Date-range charts + CSV export |
| WhatsApp Status | `/whatsapp/` | `whatsapp_integration/status.html` | Readiness management, send log |
| Recipients | `/whatsapp/recipients/` | `whatsapp_integration/recipients.html` | Recipient CRUD + test send |
| Settings | `/settings/` | `settings_manager/settings.html` | Threshold and operational config form |

### Dashboard Page — Key Layout

```
┌────────────────────────────────────────────────────────────────┐
│  NAVBAR                                              [● ws]    │
├──────────────────┬─────────────────────────────────────────────┤
│  Risk Status     │  Pressure Chart (last 24h)                  │
│  Card            ├─────────────────────────────────────────────┤
│                  │  Temperature Chart (last 24h)               │
├──────────────────┴─────────────────────────────────────────────┤
│  Recent Alerts (last 5 rows)                                   │
└────────────────────────────────────────────────────────────────┘
```

Risk card background colours: LOW=green, MEDIUM=amber, HIGH=red, BUFFERING=grey, UNAVAILABLE=black.

Charts: Chart.js line charts. Max 500 points displayed (shift oldest on overflow). Threshold lines (dashed) from Django template context. Updated live from WebSocket messages.

### Static JavaScript Files

**`static/js/dashboard.js`** — responsibilities:
- `initCharts(pressureData, temperatureData, thresholds)` — creates Chart.js instances
- `appendChartPoint(reading)` — appends new point; shifts oldest if count > 500
- `updateRiskCard(prediction, status)` — updates badge colour, probability text, timestamp
- `prependAlertRow(alert)` — adds new row to recent alerts table, removes oldest
- `connectWebSocket()` — establishes WS connection with auto-reconnect (3-second retry)
- `setConnectionIndicator(state)` — toggles navbar dot colour
- `loadInitialData()` — runs on DOM ready; calls three REST APIs in `Promise.all`

**`static/js/alerts.js`** — responsibilities:
- `loadAlerts(params)` — fetches alert history with current filter params; renders table
- `retryAlert(alertId, rowElement)` — calls `POST /api/v1/alerts/{id}/retry/`; updates badge
- Filter form `change` handler; pagination prev/next

### URL Configuration (`apps/dashboard/urls.py`)

```python
urlpatterns = [
    path("",                    DashboardView.as_view(),          name="dashboard"),
    path("alerts/",             AlertHistoryView.as_view(),        name="alert_history"),
    path("history/",            SensorHistoryView.as_view(),       name="sensor_history"),
    path("whatsapp/",           WhatsAppStatusPageView.as_view(),  name="whatsapp_status"),
    path("whatsapp/recipients/",RecipientsPageView.as_view(),      name="recipients"),
    path("settings/",           SettingsPageView.as_view(),        name="settings"),
]
```

---

## 8. Real-Time Data Flow

### Transport Stack

- **Protocol:** WebSocket (ws://)
- **Library:** Django Channels 4.x
- **Channel layer:** `InMemoryChannelLayer` (single-process local deployment; Redis-upgradeable)
- **Channel group name:** `"dashboard"`
- **Consumer:** `DashboardConsumer` (async) — joins group on connect, leaves on disconnect
- **Direction:** Server-to-client only. Browser does not send messages.
- **Reconnect:** Client JavaScript reconnects after 3-second delay on disconnect.

### Reading Arrival → Browser Update Flow

```
1. ESP32 or simulator:
   POST /api/v1/readings/  (X-API-Key header, JSON body)

2. sensor_ingest/views.py:
   a. Validate → 400/401/409 on failure
   b. Save SensorReading to DB
   c. get_predictor().add_reading(dict) → prediction or buffering or None
   d. If prediction: save Prediction row to DB
   e. AlertRulesEngine.evaluate(reading, prediction) → alert_events list
   f. If alert_events: threading.Thread(_dispatch_whatsapp).start()
   g. async_to_sync(channel_layer.group_send)(
          "dashboard",
          {
            "type": "sensor.update",
            "reading": {...},
            "prediction": {...} | null,
            "prediction_status": "ok" | "buffering" | "model_unavailable",
            "alerts": [...]
          }
      )
   h. Return HTTP 201

3. DashboardConsumer.sensor_update(event):
   Forwards the message to every WebSocket client in the "dashboard" group.

4. Browser (dashboard.js):
   ws.onmessage → parse JSON → appendChartPoint + updateRiskCard + prependAlertRow
```

### WebSocket Message: `sensor.update`

```json
{
  "type": "sensor.update",
  "reading": {
    "id": 142,
    "timestamp": "2026-04-11T15:30:00",
    "pressure_hPa": 1005.2,
    "temperature_C": 28.1
  },
  "prediction": {
    "storm_probability": 0.7832,
    "prediction": 1,
    "risk_level": "HIGH"
  },
  "prediction_status": "ok",
  "alerts": [
    {
      "id": 17,
      "rule_type": "STORM_PROBABILITY",
      "severity": "HIGH",
      "message": "⚠️ Storm Alert: Storm probability is 78%..."
    }
  ]
}
```

When buffering: `"prediction": null, "prediction_status": "buffering", "alerts": []`

---

## 9. Database Blueprint

### Engine and Strategy

- Engine: SQLite (local Phase 2). All column types and constraints are PostgreSQL-compatible.
- Django ORM only. No raw SQL in application code.
- All timestamps stored in UTC.
- Soft deletes not used — physical deletion.
- `system_settings` rows are seeded by fixture; no dynamic creation by user action.
- `whatsapp_runtime_status` always has exactly one row (singleton pattern, id=1).

### Entity Relationship Summary

```
sensor_readings ──< predictions
sensor_readings ──< alert_events
predictions     ──< alert_events (nullable)
alert_rules     ──< alert_events
alert_events    ──< whatsapp_send_log
whatsapp_recipients ──< whatsapp_send_log
```

### Tables

#### `sensor_readings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `timestamp` | DATETIME | NOT NULL, UNIQUE | Sensor-reported time; 409 on duplicate |
| `pressure_hpa` | FLOAT | NOT NULL | Clipped 900–1100 at ingest |
| `temperature_c` | FLOAT | NOT NULL | Clipped -60–60 at ingest |
| `received_at` | DATETIME | NOT NULL, default now() | Server-side receipt time |
| `source` | VARCHAR(20) | NOT NULL, default `'sensor'` | `sensor`, `simulator`, `manual` |

#### `predictions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK | |
| `reading_id` | INTEGER | NOT NULL, FK → sensor_readings, CASCADE | One-to-one with a reading |
| `storm_probability` | FLOAT | NOT NULL | 0.0–1.0 |
| `prediction` | INTEGER | NOT NULL | 0=no storm, 1=storm |
| `risk_level` | VARCHAR(10) | NOT NULL | `LOW`, `MEDIUM`, `HIGH` |
| `decision_threshold` | FLOAT | NOT NULL, default 0.5 | Stored at prediction time for audit |
| `created_at` | DATETIME | NOT NULL, default now() | |

#### `alert_rules`

Seeded by fixture. 5 rows (one per rule type).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK | |
| `rule_type` | VARCHAR(30) | NOT NULL, UNIQUE | `STORM_PROBABILITY`, `PRESSURE_HIGH`, `PRESSURE_LOW`, `TEMPERATURE_HIGH`, `TEMPERATURE_LOW` |
| `name` | VARCHAR(100) | NOT NULL | Human-readable label |
| `threshold_value` | FLOAT | NOT NULL | Trigger value |
| `severity` | VARCHAR(10) | NOT NULL | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `enabled` | BOOLEAN | NOT NULL, default True | Per-rule master switch |
| `cooldown_minutes` | INTEGER | NOT NULL, default 30 | Min gap between events of same type |
| `message_template` | TEXT | NOT NULL | Python `.format()` string |
| `created_at` / `updated_at` | DATETIME | NOT NULL | |

#### `alert_events`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK | |
| `rule_id` | INTEGER | FK → alert_rules, SET NULL | Nullable: rule may be deleted but event must persist |
| `reading_id` | INTEGER | NOT NULL, FK → sensor_readings, CASCADE | |
| `prediction_id` | INTEGER | nullable, FK → predictions, SET NULL | |
| `rule_type` | VARCHAR(30) | NOT NULL | Denormalized for query speed |
| `severity` | VARCHAR(10) | NOT NULL | Severity at trigger time |
| `triggered_value` | FLOAT | NOT NULL | Value that crossed the threshold |
| `threshold_value` | FLOAT | NOT NULL | Threshold snapshot at trigger time |
| `message` | TEXT | NOT NULL | Rendered message |
| `whatsapp_status` | VARCHAR(25) | NOT NULL | `PENDING`, `SENT`, `FAILED`, `SKIPPED`, `MANUAL_CHECK_NEEDED` |
| `created_at` | DATETIME | NOT NULL | |
| `sent_at` | DATETIME | nullable | Set after dispatch attempt |

#### `whatsapp_recipients`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK | |
| `name` | VARCHAR(100) | NOT NULL | |
| `phone` | VARCHAR(20) | NOT NULL, UNIQUE | E.164: `+923001234567` |
| `active` | BOOLEAN | NOT NULL, default True | Only active recipients get alerts |
| `notes` | TEXT | nullable | |
| `created_at` | DATETIME | NOT NULL | |

Validation regex: `^\+[1-9]\d{7,14}$`

#### `whatsapp_send_log`

One row per send attempt per recipient.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK | |
| `alert_event_id` | INTEGER | nullable, FK → alert_events, SET NULL | Null for test sends |
| `recipient_id` | INTEGER | nullable, FK → whatsapp_recipients, SET NULL | Null if recipient deleted |
| `phone` | VARCHAR(20) | NOT NULL | Denormalized; recipient may be deleted |
| `message` | TEXT | NOT NULL | Exact text sent |
| `status` | VARCHAR(25) | NOT NULL | `SUCCESS`, `FAILED`, `MANUAL_CHECK_NEEDED` |
| `error_message` | TEXT | nullable | Exception message, max 500 chars |
| `attempted_at` | DATETIME | NOT NULL, default now() | |
| `is_test` | BOOLEAN | NOT NULL, default False | |

#### `whatsapp_runtime_status` (singleton)

Always exactly one row (id=1).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | PK, always 1 |
| `browser_ready` | BOOLEAN | Set by operator via UI; False by default |
| `last_confirmed_at` | DATETIME | nullable; when last set True |
| `confirmed_by` | VARCHAR(100) | nullable; operator name |
| `notes` | TEXT | nullable |
| `updated_at` | DATETIME | auto-updated |

**Staleness rule:** If `last_confirmed_at` > 4 hours ago, UI shows amber warning. Flag is not auto-reset.

#### `system_settings`

Key-value configuration. 9 seeded rows. No dynamic creation.

| `key` | `value` | `value_type` | Description |
|-------|---------|--------------|-------------|
| `storm_probability_threshold` | `0.70` | `float` | Min storm probability to trigger alert |
| `pressure_high_threshold` | `1030.0` | `float` | hPa upper threshold |
| `pressure_low_threshold` | `990.0` | `float` | hPa lower threshold |
| `temperature_high_threshold` | `40.0` | `float` | °C upper threshold |
| `temperature_low_threshold` | `0.0` | `float` | °C lower threshold |
| `alert_cooldown_minutes` | `30` | `int` | Default cooldown; overridden per rule |
| `whatsapp_alerts_enabled` | `true` | `bool` | Master WhatsApp send switch |
| `dashboard_history_hours` | `24` | `int` | Hours of data shown on chart initial load |
| `model_buffer_size` | `12` | `int` | `StormPredictor` deque maxlen |

### Fixture File

`storm_webapp/fixtures/initial_data.json` seeds: 5 `AlertRule` rows, 9 `SystemSetting` rows, 1 `WhatsAppRuntimeStatus` row (id=1, browser_ready=False).

```bash
python manage.py loaddata fixtures/initial_data.json
```

### PostgreSQL Upgrade Path

Replace `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/storm_prediction
```
Install `psycopg2-binary`, run `migrate` on new DB, load fixtures.

---

## 10. API Blueprint

### REST Endpoint Summary

All endpoints use prefix `/api/v1/`. All bodies are `application/json`. Timestamps are ISO 8601 UTC.

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/readings/` | X-API-Key | Ingest sensor reading; triggers ML + alerting |
| GET | `/api/v1/readings/` | none | Reading history (hours, limit, offset, source) |
| GET | `/api/v1/predictions/latest/` | none | Most recent prediction |
| GET | `/api/v1/predictions/` | none | Prediction history |
| GET | `/api/v1/alerts/` | none | Alert event history (hours, rule_type, severity, whatsapp_status) |
| POST | `/api/v1/alerts/{id}/retry/` | none | Retry WhatsApp for FAILED or MANUAL_CHECK_NEEDED event |
| GET | `/api/v1/alert-rules/` | none | All alert rules with current configuration |
| PATCH | `/api/v1/alert-rules/{id}/` | none | Update alert rule (partial) |
| GET | `/api/v1/settings/` | none | All system settings |
| PUT | `/api/v1/settings/{key}/` | none | Update a single setting value |
| GET | `/api/v1/whatsapp/recipients/` | none | All recipients |
| POST | `/api/v1/whatsapp/recipients/` | none | Add recipient |
| PATCH | `/api/v1/whatsapp/recipients/{id}/` | none | Update recipient (toggle active) |
| DELETE | `/api/v1/whatsapp/recipients/{id}/` | none | Delete recipient |
| GET | `/api/v1/whatsapp/status/` | none | WhatsApp operational status |
| POST | `/api/v1/whatsapp/status/set-ready/` | none | Set browser readiness flag |
| POST | `/api/v1/whatsapp/test-send/` | none | Send test message (blocks up to 30s) |
| GET | `/api/v1/whatsapp/send-log/` | none | Recent send log |

### Ingest Endpoint: `POST /api/v1/readings/`

Request body:
```json
{
  "timestamp": "2026-04-11T15:30:00",
  "pressure_hPa": 1005.2,
  "temperature_C": 28.1,
  "source": "sensor"
}
```

Response `201` — success with prediction:
```json
{
  "reading_id": 142,
  "prediction": {
    "storm_probability": 0.7832,
    "prediction": 1,
    "risk_level": "HIGH",
    "decision_threshold": 0.5
  },
  "alerts_triggered": 1,
  "status": "ok"
}
```

Response `201` — during buffer warmup:
```json
{
  "reading_id": 3,
  "prediction": null,
  "prediction_status": "buffering",
  "buffer_readings": 3,
  "alerts_triggered": 0,
  "status": "buffering"
}
```

Errors: `400` validation failure, `401` invalid API key, `409` duplicate timestamp.

### WebSocket Endpoint

`WS /ws/dashboard/` — server-to-client only. See Section 8 for message schema.

### URL Configuration

```python
# storm_webapp/urls.py
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.sensor_ingest.urls")),
    path("api/v1/", include("apps.predictions.urls")),
    path("api/v1/", include("apps.alerting.urls")),
    path("api/v1/", include("apps.whatsapp_integration.urls")),
    path("api/v1/", include("apps.settings_manager.urls")),
    path("", include("apps.dashboard.urls")),
]
```

### Phase 1 CLI Interface (preserved)

The Phase 1 system has no HTTP API. Its "API" is CLI arguments. The inference input/output contract:

**Input** — JSON array of readings (minimum 4 needed for a prediction):
```json
[
  {"timestamp": "2023-12-31T18:00:00", "pressure_hPa": 1016.75, "temperature_C": 14.39},
  ...
]
```

**Output**:
```json
{
  "storm_probability": 0.0312,
  "prediction": 0,
  "risk_level": "LOW",
  "decision_threshold": 0.70
}
```

---

## 11. Alerting and Rule Engine

### Rule Types and Default Configuration

| Rule Type | Default Threshold | Trigger Condition |
|-----------|------------------|-------------------|
| `STORM_PROBABILITY` | 0.70 | `prediction.storm_probability >= threshold` |
| `PRESSURE_HIGH` | 1030.0 hPa | `reading.pressure_hpa >= threshold` |
| `PRESSURE_LOW` | 990.0 hPa | `reading.pressure_hpa <= threshold` |
| `TEMPERATURE_HIGH` | 40.0°C | `reading.temperature_c >= threshold` |
| `TEMPERATURE_LOW` | 0.0°C | `reading.temperature_c <= threshold` |

### Severity Escalation Logic

| Rule | Condition | Severity |
|------|-----------|----------|
| STORM_PROBABILITY | probability >= 0.80 | HIGH |
| STORM_PROBABILITY | probability >= 0.60 | MEDIUM |
| STORM_PROBABILITY | probability < 0.60 (but >= threshold) | LOW |
| PRESSURE_HIGH | value >= threshold + 10 | CRITICAL |
| PRESSURE_HIGH | value >= threshold | HIGH |
| PRESSURE_LOW | value <= threshold - 10 | HIGH |
| PRESSURE_LOW | value <= threshold | MEDIUM |
| TEMPERATURE_HIGH | value >= threshold + 5 | HIGH |
| TEMPERATURE_HIGH | value >= threshold | MEDIUM |
| TEMPERATURE_LOW | value <= threshold - 5 | HIGH |
| TEMPERATURE_LOW | value <= threshold | MEDIUM |

### Cooldown Logic

- Cooldown is enforced via a DB query (not in-memory) so it survives restarts.
- Window: measured from `created_at` of the most recent `AlertEvent` for the same `rule_type`.
- **Severity escalation overrides cooldown**: a higher-severity event fires even within the cooldown window.

```python
rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
if rank.get(new_severity, 0) > rank.get(last_event.severity, 0):
    return False  # Escalation — fire regardless of cooldown
```

Example cooldown timeline (STORM_PROBABILITY, cooldown=30min):
```
t=00:00  prob=0.75 (MEDIUM) → AlertEvent created, WhatsApp sent
t=00:15  prob=0.78 (MEDIUM) → cooldown active, SKIPPED
t=00:25  prob=0.85 (HIGH)   → severity escalation: BYPASSED, AlertEvent created
t=00:30  prob=0.82 (HIGH)   → cooldown active (last event at 00:25), SKIPPED
t=01:00  prob=0.72 (MEDIUM) → 35min since 00:25, cooldown expired, AlertEvent created
```

### Alert Decision Matrix

| Condition | Log AlertEvent? | Send WhatsApp? | `whatsapp_status` |
|-----------|----------------|----------------|-------------------|
| Rule triggered, cooldown passed, browser ready, recipient exists | YES | YES | `SENT` or `FAILED` |
| Rule triggered, cooldown passed, browser NOT ready | YES | NO | `MANUAL_CHECK_NEEDED` |
| Rule triggered, cooldown passed, master switch OFF | YES | NO | `SKIPPED` |
| Rule triggered, cooldown passed, no active recipients | YES | NO | `SKIPPED` |
| Rule triggered, cooldown active, same or lower severity | NO | NO | — |
| Rule triggered, cooldown active, severity escalation | YES | YES | (as above) |
| Rule disabled | NO | NO | — |
| pywhatkit raises exception | YES | Attempted, FAILED | `FAILED` |
| Model not loaded (STORM_PROBABILITY rule) | NO | NO | — |
| Buffer warm-up (STORM_PROBABILITY rule) | NO | NO | — |

### Noise Protection Mechanisms

1. **Cooldown** — same rule type is silent for `cooldown_minutes` after firing.
2. **Duplicate timestamp rejection** — ingest API rejects readings with the same timestamp (HTTP 409).
3. **Physical bounds clipping** — pressure clipped 900–1100 hPa; temperature -60–60°C at ingest. Impossible sensor glitch values do not trigger alerts.

**Phase 2 limitation:** Alert rules evaluate on raw individual readings, not rolling averages. A single anomalous reading can trigger a threshold alert. Phase 3 enhancement: add a 3-reading rolling average check before threshold evaluation.

### Cache Invalidation

`AlertRule` rows are cached in a module-level dict with a 60-second TTL. Cache is invalidated immediately when any `AlertRule` is saved or deleted via Django signals:

```python
@receiver(post_save, sender=AlertRule)
def invalidate_on_save(sender, **kwargs):
    AlertRulesEngine.invalidate_cache()
```

---

## 12. WhatsApp Integration Architecture

### Architecture Position

pywhatkit is isolated exclusively in `services/whatsapp_sender.py`. Nothing outside this file imports pywhatkit. The entire integration is replaceable by modifying only this one file.

```
alerting.engine.AlertRulesEngine._dispatch_whatsapp()
        │
        └── services.whatsapp_sender.WhatsAppSenderService.send_alert(phone, message, ...)
                │
                ├── Checks WhatsAppRuntimeStatus.browser_ready
                ├── Calls pywhatkit.sendwhatmsg_instantly(...)
                ├── Catches ALL exceptions (never raises)
                └── Writes WhatsAppSendLog row
                        │
                        └── Returns SendResult(success, error, log_id)
```

### How pywhatkit Works

`pywhatkit.sendwhatmsg_instantly()`:
1. Opens a new Chrome tab to `https://web.whatsapp.com/send?phone=<number>&text=<message>`
2. Waits `wait_time` seconds (default 20) for the page to load
3. Uses `pyautogui` to press Enter to send the message
4. Closes the tab after `close_time` seconds (default 3)

This is **browser automation, not a messaging API**. It requires an active, logged-in WhatsApp Web session in Chrome on the same machine.

### Multi-Recipient Sequential Send

Sending is always sequential, never concurrent. Each send is followed by a mandatory `time.sleep(25)` before the next recipient.

**Blocking time calculation:**
```
Per send: 20 (wait) + 3 (close) = 23s
For 2 recipients: 23 + 25 (gap) + 23 = ~71s
```

Dispatch runs in a `threading.Thread(daemon=True)` so the HTTP response returns immediately.

### Runtime Requirements

| Requirement | Detail |
|-------------|--------|
| Same machine | Django and Chrome on same physical machine |
| GUI / display | Active desktop session; cannot run headless |
| Chrome installed | Chrome or Chromium; must be set as default browser |
| WhatsApp Web logged in | Active QR-scanned session in Chrome |
| Chrome tab open | WhatsApp Web tab must remain open (minimised is OK) |
| Screen not locked | pyautogui cannot interact with a locked screen |
| `browser_ready = True` | Operator must click "Mark as Ready" after confirming Chrome |
| `whatsapp_alerts_enabled = true` | Master switch in system_settings |
| At least one active recipient | `WhatsAppRecipient` with `active=True` |

### Operator Readiness Confirmation

Because pywhatkit has no programmatic session detection, the system uses a manual confirmation mechanism:

1. Operator opens Chrome, loads `https://web.whatsapp.com`, confirms chat list is visible.
2. Operator navigates to `http://localhost:8000/whatsapp/`.
3. Operator enters their name and clicks "Mark as Ready".
4. `WhatsAppRuntimeStatus.browser_ready` is set to `True`.
5. If `last_confirmed_at` is more than 4 hours ago, the UI shows an amber "STALE" warning.
6. `browser_ready` is NOT automatically reset — only the operator can mark not-ready.

### Fallback Behaviour

| Scenario | AlertEvent logged? | WhatsApp sent? | whatsapp_status |
|----------|-------------------|----------------|-----------------|
| `browser_ready = False` | YES | NO | `MANUAL_CHECK_NEEDED` |
| pywhatkit exception | YES | Attempted | `FAILED` |
| Master switch OFF | YES | NO | `SKIPPED` |
| No active recipients | YES | NO | `SKIPPED` |
| Partial recipient failure | YES | Some | `SENT` (individual failures in send log) |

No alert data is ever lost. All events are stored regardless of WhatsApp status. Failed events can be retried from the alerts page via `POST /api/v1/alerts/{id}/retry/`.

### Known Limitations (permanent pywhatkit constraints)

| Constraint | Value |
|------------|-------|
| Seconds per message send | ~23–35 (browser load time) |
| Min gap between sequential sends | 25s |
| Max recipients before blocking >100s | ~4 |
| Session expiry detection | None — manual check only |
| Send confirmation / delivery receipt | None |
| Concurrent sends | Not supported |
| Headless operation | Not supported (requires GUI) |
| One Chrome tab opened per send | Visible to the operator |

### Replacement Path

If pywhatkit becomes unacceptable, replace only `services/whatsapp_sender.py`. The `WhatsAppSenderService.send_alert(phone, message, ...) -> SendResult` interface must remain identical. The rest of the codebase is unaffected.

Candidates: Twilio API for WhatsApp, WhatsApp Business API (Meta), CallMeBot.

---

## 13. Configuration and Environment

### Two-Layer Configuration Model

**Layer 1 — Deploy-time (`.env` → `settings/base.py`):**
Values that are machine-specific or security-sensitive. Set once per deployment.

**Layer 2 — Runtime (`system_settings` DB table):**
Values the operator can change during operation without restarting the server.

### `.env.example` (deploy-time variables)

```dotenv
# REQUIRED
DJANGO_SECRET_KEY=replace-this-with-a-long-random-string
SENSOR_API_KEY=change-me-before-use

# Optional with defaults
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
STORM_MODEL_PATH=           # defaults to <repo_root>/models/storm_model_v1.pkl
DATABASE_URL=sqlite:///db.sqlite3
USE_REDIS_CHANNEL_LAYER=False
REDIS_URL=redis://127.0.0.1:6379/0
WHATSAPP_WAIT_TIME=20       # seconds pywhatkit waits for browser tab
WHATSAPP_INTER_SEND_DELAY=25 # seconds gap between sequential sends
LOG_LEVEL=INFO
```

### Settings Package (`settings/base.py` pattern)

```python
from decouple import config, Csv
from pathlib import Path
import sys

BASE_DIR  = Path(__file__).resolve().parent.parent   # storm_webapp/
REPO_ROOT = BASE_DIR.parent                          # repo root
sys.path.insert(0, str(REPO_ROOT))                  # makes src/ importable

SECRET_KEY    = config("DJANGO_SECRET_KEY")
DEBUG         = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

_default_model_path = str(REPO_ROOT / "models" / "storm_model_v1.pkl")
STORM_MODEL_PATH = config("STORM_MODEL_PATH", default=_default_model_path) or _default_model_path

SENSOR_API_KEY            = config("SENSOR_API_KEY", default="change-me")
WHATSAPP_WAIT_TIME        = config("WHATSAPP_WAIT_TIME", default=20, cast=int)
WHATSAPP_INTER_SEND_DELAY = config("WHATSAPP_INTER_SEND_DELAY", default=25, cast=int)
```

`settings/local.py`: `from .base import *` with `DEBUG = True`.

### Phase 1 Configuration (retained)

Phase 1 uses `config.yaml` for documentation of paths and thresholds. However, **`config.yaml` is not read at runtime by any `src/` module** — all modules use `argparse` CLI defaults. This disconnection is a known gap from Phase 1.

### LAN Deployment

To expose the server on a local network (for ESP32 on same LAN):

1. Find server LAN IP: `ipconfig` (Windows) or `ip addr` (Linux)
2. Add to `.env`: `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.100`
3. Start Daphne bound to all interfaces: `daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application`
4. ESP32 posts to `http://192.168.1.100:8000/api/v1/readings/`

---

## 14. Deployment / Runtime Architecture

### Phase 1: Local Offline Pipeline

Phase 1 has no server. The entire system runs as a sequence of CLI commands on a developer's machine. No containerization, no daemon, no persistent process.

**Full training pipeline (Windows PowerShell):**
```powershell
.\Storm-venv\Scripts\python.exe src\data_loader.py --source synthetic --output data\raw\weather_raw.csv
.\Storm-venv\Scripts\python.exe src\preprocessing.py --input data\raw\weather_raw.csv --output data\processed\weather_clean.csv
.\Storm-venv\Scripts\python.exe src\features.py --input data\processed\weather_clean.csv --output data\processed\weather_features.csv
.\Storm-venv\Scripts\python.exe src\labels.py --input data\processed\weather_features.csv --output data\processed\weather_labeled.csv --horizon 3
.\Storm-venv\Scripts\python.exe src\tune.py --data data\processed\weather_labeled.csv --output models\storm_model.pkl
```

**Inference:**
```powershell
.\Storm-venv\Scripts\python.exe app\local_infer.py --model models\storm_model.pkl --input sample_input.json
```

### Phase 2: Django ASGI Server

**Single-process Daphne (required):**
```bash
# Local only
daphne -p 8000 storm_webapp.asgi:application

# LAN accessible
daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application
```

**Startup sequence and expected log output:**
```
INFO ml_engine StormPredictor loaded from .../storm_model_v1.pkl
Django version 5.x.x, using settings 'storm_webapp.settings.local'
Starting ASGI/Daphne version 4.x.x development server at http://0.0.0.0:8000/
```

**Deployment stack summary:**

| Component | Tool | Notes |
|-----------|------|-------|
| ASGI server | Daphne 4.x | **Single process**; required for channel layer and predictor singleton |
| Web framework | Django 5.x | |
| Real-time | Django Channels 4.x | InMemoryChannelLayer |
| Database | SQLite | File at `storm_webapp/db.sqlite3` |
| ML runtime | XGBoost + joblib | Loaded once at startup |
| WhatsApp | pywhatkit 5.4+ | Requires Chrome + WhatsApp Web session on same machine |
| Browser | Chrome / Chromium | Must remain open with WhatsApp Web logged in |
| Python | 3.11+ | |
| OS | Windows 10/11 or Ubuntu Desktop with GUI | pywhatkit requires display |

**Machine requirements:**
- Active desktop session (display must not be locked during WhatsApp sends)
- Chrome installed
- 4 GB RAM minimum
- 500 MB free storage
- Network reachable by ESP32 (same LAN or loopback)

### Phase 3: Planned MQTT Streaming

```
ESP32 + BME280 + Rain + Wind Sensors
    → MQTT Broker (Mosquitto)
    → Python MQTT Subscriber
    → SQLite/PostgreSQL Buffer
    → Feature Engine (extended with humidity, wind)
    → Retrained XGBoost
    → Alert System + Dashboard
```

---

## 15. Key End-to-End Flows

### Flow 1: Full ML Training Pipeline (Phase 1)

1. `data_loader.py` → 17,520-row synthetic dataset with injected storm events → `data/raw/weather_raw.csv`
2. `preprocessing.py` → sort, clip, resample, forward-fill → `data/processed/weather_clean.csv`
3. `features.py` → compute 16 features → `data/processed/weather_features.csv`
4. `labels.py` → pressure-drop rule labeling → `data/processed/weather_labeled.csv`
5. `tune.py` → 1,296-combination grid search, time-aware split → `models/storm_model.pkl` + `model_metadata.json`
6. `evaluate.py` → Precision: 0.571, Recall: 0.154, F1: 0.242, ROC-AUC: 0.875

### Flow 2: Sensor Reading Arrives — Live Processing (Phase 2)

```
ESP32 → POST /api/v1/readings/ → Validate → Save SensorReading → ML inference
                                                                       │
                                         ┌─────────────────────────────┤
                                         │                             │
                                         ▼                             ▼
                                   Save Prediction              AlertRulesEngine.evaluate()
                                         │                             │
                                         │                    ┌────────┴────────┐
                                         │                    ▼                 ▼
                                         │           Save AlertEvent    Background thread:
                                         │                              _dispatch_whatsapp()
                                         │                                      │
                                         │                              Sequential per recipient:
                                         │                              pywhatkit.sendwhatmsg_instantly()
                                         │
                                         ▼
                               channel_layer.group_send("dashboard", sensor_update_payload)
                                         │
                                         ▼
                               DashboardConsumer → WebSocket → Browser
                                         │
                                         ▼
                               HTTP 201 returned to ESP32
```

### Flow 3: WhatsApp Alert Dispatch

```
1. _dispatch_whatsapp([alert_event]) called in background thread
2. Check SystemSetting.get_value("whatsapp_alerts_enabled")
   → if False: mark events SKIPPED, return
3. Load WhatsAppRecipient.objects.filter(active=True)
   → if none: mark events SKIPPED, return
4. For each alert_event:
   a. For each recipient (index i):
      - WhatsAppSenderService.send_alert(phone, message, ...)
        → check browser_ready → if False: log MANUAL_CHECK_NEEDED, return
        → pywhatkit.sendwhatmsg_instantly(...)
        → catch all exceptions → log SUCCESS or FAILED
      - if i < last: time.sleep(25)
   b. Update AlertEvent.whatsapp_status: SENT / FAILED / MANUAL_CHECK_NEEDED
   c. Set AlertEvent.sent_at = now()
```

### Flow 4: Operator Confirms WhatsApp Readiness

```
1. Operator opens Chrome on the Django machine.
2. Navigates to https://web.whatsapp.com — confirms chat list visible.
3. Opens http://localhost:8000/whatsapp/
4. Enters name in "Confirmed by" field.
5. Clicks "Mark as Ready".
6. Browser: POST /api/v1/whatsapp/status/set-ready/ {"ready": true, "confirmed_by": "Talha"}
7. Server: WhatsAppRuntimeStatus.objects.get_or_create(id=1) → update browser_ready=True
8. Status card turns green: READY.
```

### Flow 5: Alert Retry

```
1. Operator on /alerts/ page sees FAILED alert.
2. Clicks "Retry".
3. Browser: POST /api/v1/alerts/{id}/retry/
4. Server: re-runs _dispatch_whatsapp for the existing AlertEvent.
5. Creates new WhatsAppSendLog rows for each recipient.
6. Updates AlertEvent.whatsapp_status.
7. No new AlertEvent is created.
```

---

## 16. Operational Runbook Summary

Full runbook: `docs/operational-runbook.md`

### Daily Startup (5 steps)

1. **Open Chrome → WhatsApp Web:** Navigate to `https://web.whatsapp.com`. Scan QR if needed. Keep tab open.
2. **Start Daphne:** `cd storm_webapp && daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application`. Confirm startup log shows model loaded.
3. **Confirm WhatsApp readiness:** Navigate to `http://localhost:8000/whatsapp/`. If STALE or NOT READY: enter name, click "Mark as Ready". Confirm status turns green.
4. **Send test message:** `/whatsapp/recipients/` → click "Send Test" on any active recipient. Wait up to 35s. Verify SUCCESS on screen and on phone.
5. **Verify dashboard:** Open `http://localhost:8000/`. Confirm WebSocket dot is green.

### Health Indicators

| Indicator | Healthy | Action if unhealthy |
|-----------|---------|---------------------|
| Navbar connection dot | Green | Restart Daphne; reload browser |
| Risk card | Shows a risk level | "BUFFERING" is normal first 3 readings after restart |
| Charts | Show data points | Check ingest API; check readings in DB |
| WhatsApp status page | READY (green) | Follow Daily Startup Step 3 |
| Django console | No ERROR lines | Read error; consult fault section in runbook |

### Screen Lock Prevention (Critical)

pyautogui cannot interact with a locked screen. During system operation:
- **Windows:** Settings → System → Power & Battery → Screen and sleep → Set to "Never"
- **Linux (GNOME):** `gsettings set org.gnome.desktop.session idle-delay 0`

Restore normal sleep settings when not running the system.

### First-Time Setup

```bash
cd storm_webapp
pip install -r requirements_webapp.txt
cp .env.example .env   # then edit: set DJANGO_SECRET_KEY and SENSOR_API_KEY
python manage.py migrate
python manage.py loaddata fixtures/initial_data.json
python manage.py createsuperuser   # optional, for /admin/ access
python manage.py check             # must output: System check identified no issues
```

---

## 17. Risks, Constraints, and Known Limitations

### Phase 1 ML Quality (unchanged)

| Risk | Severity | Notes |
|------|----------|-------|
| **Recall = 15.4% vs. 80% target** | Critical | Model misses ~85% of storms. Decision threshold lowering, SMOTE, or focal loss may improve recall. |
| **Synthetic-only training data** | High | NOAA StormEvents CSVs present in `data/` but not wired into training pipeline. |
| **No cross-validation in tuning** | High | Single time-split; tuned model may overfit to the specific validation window. |
| **`config.yaml` not read at runtime** | Medium | Aspirational config; creates false documentation signal. |
| **Unpinned dependencies in `requirements.txt`** | Medium | Reproducibility risk for Phase 1 environment. |
| **Synthetic storm injection shape is fixed** | Medium | Injected drop profile `[0, -1.2, -2.8, -4.6, -3.7, -2.0]` may cause model to overfit to this specific signature. |

### Phase 2 Architecture Constraints

| Constraint | Impact |
|------------|--------|
| **Single-process Daphne required** | Cannot horizontally scale the web server while using the predictor singleton |
| **In-memory buffer lost on restart** | First 3 readings after restart produce no prediction; dashboard shows BUFFERING |
| **pywhatkit is browser automation** | All WhatsApp sending limitations in Section 12 apply permanently unless pywhatkit is replaced |
| **Screen must not lock during sends** | Operational requirement; must be actively managed |
| **No per-user authentication in Phase 2** | Anyone on the LAN can access the dashboard and modify settings |
| **WhatsApp session expiry undetectable** | No programmatic way to know if the session has expired; manual monitoring required |
| **Sequential WhatsApp sends** | 5 recipients with 25s gaps = ~2.5 minutes to dispatch one alert; ESP32 timeout risk |
| **Single alert rules cache per process** | Cache TTL is 60s; threshold changes take up to 60s to apply |

### Security Notes

- `SENSOR_API_KEY` must be changed before LAN deployment. Default value `change-me` is insecure.
- Physical bounds clipping (900–1100 hPa, -60–60°C) is enforced at ingest serializer — a tampered sensor cannot produce extreme values that mislead the model.
- `joblib.load()` can execute arbitrary code if the `.pkl` file is tampered with. Keep `models/` write-protected.
- Management endpoints (settings, recipients) are protected only by LAN access in Phase 2. Do not expose publicly.

---

## 18. What Was Reused vs Newly Built

### Phase 1 Assets — Reused Unchanged in Phase 2

| Asset | Reuse Method |
|-------|-------------|
| `src/predict.py` — `StormPredictor` class | Imported exclusively by `ml_engine/predictor.py`; never touched by any Django app |
| `src/features.py` — `generate_features()` | Called by `StormPredictor.add_reading()` internally; Django has no direct dependency |
| `src/constants.py` — `FEATURE_COLS`, `RISK_THRESHOLDS` | Used by `src/predict.py` and `src/features.py`; unchanged |
| `models/storm_model_v1.pkl` | Loaded by `StormPredictor` via `settings.STORM_MODEL_PATH`; never modified |
| `models/model_metadata.json` | Read by `StormPredictor` to get `decision_threshold`; never modified |
| `src/labels.py`, `src/train.py`, `src/evaluate.py`, `src/tune.py` | Not used by web app; remain available for offline retraining |
| `data/raw/weather_raw.csv` and processed CSV chain | Not used by web app; retained for retraining |

**Immutable constraint:** The 16 feature names in `FEATURE_COLS` must never change without retraining the model. The model artifact and the feature engineering code are a frozen pair.

### Newly Built in Phase 2

| Component | Description |
|-----------|-------------|
| `storm_webapp/` Django project | Entire project directory structure, settings, URLs, ASGI |
| `ml_engine/` module | Singleton wrapper around `StormPredictor`; loads at startup |
| `services/whatsapp_sender.py` | Complete pywhatkit isolation; `WhatsAppSenderService`; `SendResult` dataclass |
| `apps/sensor_ingest/` | Ingest view, API key decorator, payload validation, duplicate rejection, orchestration |
| `apps/predictions/` | `Prediction` model; prediction history API |
| `apps/alerting/` | `AlertRule` model; `AlertEvent` model; `AlertRulesEngine` class; cooldown; severity escalation |
| `apps/whatsapp_integration/` | `WhatsAppRecipient`, `WhatsAppSendLog`, `WhatsAppRuntimeStatus` models; all UI pages |
| `apps/settings_manager/` | `SystemSetting` model; `get_value()`/`set_value()` classmethods; settings UI |
| `apps/dashboard/` | 3 HTML views + `DashboardConsumer` WebSocket consumer |
| 6 HTML templates | Bootstrap-based server-rendered pages |
| `static/js/dashboard.js` | Chart.js, WebSocket, risk card, auto-reconnect |
| `static/js/alerts.js` | Alert table, retry, pagination |
| `fixtures/initial_data.json` | Seeds all 5 alert rules, 9 system settings, 1 runtime status row |
| `tools/sensor_simulator.py` | ESP32 simulator for local testing |
| 8-table SQLite schema | Full schema designed and specified |
| 15+ REST API endpoints | Complete API contract |
| WebSocket endpoint | `WS /ws/dashboard/` with `sensor.update` message type |

---

## 19. Future Enhancements

### Immediate (Phase 2 gaps)

| Enhancement | Priority | Notes |
|-------------|----------|-------|
| Replace pywhatkit with Twilio/WhatsApp Business API | High | Eliminates all browser automation constraints |
| Add rolling average check before threshold alerts | Medium | Prevents single-reading spikes from triggering alerts |
| Wire `WHATSAPP_ALERTS_ENABLED` env var as DB seed | Low | Currently the env var only sets the initial DB value |

### Short-Term ML Improvements

| Enhancement | Priority |
|-------------|----------|
| Lower recall target or try focal loss / SMOTE to improve 15.4% recall | Critical |
| Add `TimeSeriesSplit` cross-validation in `tune.py` | High |
| Wire NOAA StormEvents CSVs into training pipeline | High |
| Pin dependency versions in `requirements.txt` | Medium |
| Add `preprocess_data()` unit tests | Medium |
| Wire `config.yaml` to actual runtime or remove it | Medium |
| Parallelize `tune.py` grid search with `joblib.Parallel(n_jobs=-1)` | Low |

### Phase 3 Architecture

| Area | Current | Target |
|------|---------|--------|
| Sensor protocol | HTTP POST | MQTT (Mosquitto broker) |
| Sensor hardware | BMP280 (pressure + temp) | BME280 (+ humidity) + rain sensor + anemometer |
| Feature set | 16 features | Extended with humidity, wind speed, wind direction |
| ML model retraining | Manual pipeline | Automated retraining trigger on data accumulation |
| Model versioning | Manual `.pkl` files | MLflow or DVC experiment tracking |
| Channel layer | InMemoryChannelLayer | Redis channel layer (multi-client, multi-process) |
| Deployment | Local laptop | Docker compose: Daphne + Redis + MQTT subscriber |
| Authentication | API key only | Django session auth for management pages |
| Monitoring | Console logs | Prediction drift monitoring; alert if miss rate rises |

---

## 20. Change Summary

### Sections Updated from v1.0

| Section | Change |
|---------|--------|
| Project Overview | Added Phase 2 actors (operator, recipients, dashboard viewer); updated phase status table |
| Tech Stack | Added complete Phase 2 technology table; retained Phase 1 table |
| Repository Structure | Added full `storm_webapp/` tree; moved original docs to `old-docs/`; added `docs/` Phase 2 documents |
| System Architecture | Added Phase 2 component diagram, Django app table, dependency boundary rules |
| Backend Design | Phase 1 backend preserved; Phase 2 Django backend added in full |
| Frontend Design | Was "Phase 1 has no frontend (planned)"; replaced with complete 6-page specification |
| Database Blueprint | Was "Phase 1 uses CSV files only (planned SQLite)"; replaced with full 8-table schema |
| API Blueprint | Was "Phase 1 has no HTTP API (planned 3 endpoints)"; replaced with 15+ endpoint specification |
| Authentication | Was "no auth (planned API key for Phase 2)"; replaced with implemented auth design |
| Configuration | Added Phase 2 `.env`/`settings/` architecture alongside retained Phase 1 config |
| Deployment | Added Phase 2 Daphne deployment alongside retained Phase 1 CLI pipeline |
| Key Flows | Added Phase 2 flows: reading arrival, WhatsApp dispatch, readiness confirmation, alert retry |
| Risks | Added Phase 2 architecture constraints to existing Phase 1 ML quality risks |

### Newly Added Sections

| Section | Content |
|---------|---------|
| System Evolution Summary | Documents architectural decisions made in Phase 2 |
| Real-Time Data Flow | WebSocket transport, message schema, sequence from ingest to browser |
| Alerting and Rule Engine | Rule types, severity logic, cooldown, noise protection, cache invalidation |
| WhatsApp Integration Architecture | Full 5-section design: technical, runtime assumptions, operator steps, limitations, fallback |
| Operational Runbook Summary | Daily startup, health indicators, screen lock prevention, first-time setup |
| What Was Reused vs Newly Built | Explicit inventory of Phase 1 reuse and Phase 2 new construction |

### Outdated Assumptions Replaced

| Old Assumption | Replaced With |
|----------------|---------------|
| "Phase 2 will introduce a simple 2-table SQLite buffer" | Full 8-table schema with alerting, recipients, send log, settings |
| "Phase 2 will expose 3 simple HTTP endpoints" | 15+ endpoint REST API + WebSocket |
| "Phase 2 frontend: planned dashboard and push notification" | Fully specified 6-page Bootstrap/Chart.js frontend |
| "Server should bind to 127.0.0.1 only" | LAN binding with `daphne -b 0.0.0.0` designed in; `ALLOWED_HOSTS` guards it |
| "Phase 2 will have no authentication" | X-API-Key for sensor ingest; LAN-only for management endpoints |

---

## Appendix A: Unresolved Inconsistencies Found Across Source Documents

1. **`storm_model_v1.pkl` vs `storm_model.pkl` as the Phase 2 model:** `docs/system-architecture.md` specifies `STORM_MODEL_PATH` defaults to `storm_model_v1.pkl` (81 KB). The original `blue_print.md` describes `storm_model.pkl` (53 KB, tuned) as the "current production model". The Phase 2 implementation uses `storm_model_v1.pkl` per the architecture doc. If the tuned `storm_model.pkl` is preferred, update `STORM_MODEL_PATH` in `.env`.

2. **`decision_threshold` in `predictions` table vs. model metadata:** `database-design.md` defines `decision_threshold` on the `predictions` table with `default=0.5`, but `model_metadata.json` sets `decision_threshold=0.7`. The 0.5 default is a DB schema default that would only apply if the value is not passed from `StormPredictor`. The actual threshold at inference time comes from `model_metadata.json` (0.7). The stored value should reflect the runtime threshold, not 0.5.

3. **`system_settings` key `alert_cooldown_minutes` vs. per-rule `cooldown_minutes`:** `database-design.md` seeds `alert_cooldown_minutes=30` as a global setting, but `alerting-rules.md` shows each `AlertRule` row has its own `cooldown_minutes` column. It is not specified how `alert_cooldown_minutes` in `system_settings` is used — whether it seeds the per-rule values or serves as a separate global override. Phase 2 implementation should clarify whether this setting is purely informational, used as a default when creating new rules, or overrides per-rule values.

4. **`WHATSAPP_ALERTS_ENABLED` env var vs. `system_settings`:** `env-template.md` notes that the env var "only sets the default; once loaded into DB via fixture, the DB value takes precedence." However, `settings/base.py` does not show the env var being seeded into the fixture programmatically. The relationship between the env var and the DB row needs to be explicit in the `AppConfig.ready()` or fixture loading logic.

5. **`docs/frontend-pages.md` lists a `/history/` page** but the URL configuration in the same file uses `path("history/", SensorHistoryView.as_view())`. The navbar in `base.html` description does not mention a History link. It is unspecified whether this page appears in the navbar. Recommend adding it to maintain discoverability.

## Appendix B: Assumptions Made While Merging Documents

1. **Phase 2 design = fully specified, not yet implemented in code.** The docs describe a complete design blueprint ready for Codex execution, but no Phase 2 code files have been confirmed to exist yet. This blueprint treats the design documents as the source of truth for what will be built.

2. **`docs/` supersedes `old-docs/` for all Phase 2 concerns.** Where old blueprint sections conflict with the Phase 2 design documents, the newer docs take precedence. Phase 1 sections in the old blueprint remain valid and are preserved.

3. **WhatsApp dispatch uses `threading.Thread(daemon=True)`.** `whatsapp-integration.md` describes this as a "recommended mitigation" rather than a hard specification. This blueprint treats it as the implemented design, because blocking the ESP32's HTTP connection for 71+ seconds is operationally unacceptable for any realistic deployment.

4. **The 6-page frontend is the final page set.** `frontend-pages.md` defines 6 pages. The navbar in `base.html` lists 5 links (Dashboard, Alerts, WhatsApp, Recipients, Settings). The Sensor History page (`/history/`) exists but may not be in the navbar — assumed it is accessible via direct URL and potentially linked from the Dashboard page.

5. **`storm_model_v1.pkl` is the runtime model for Phase 2** based on the env-template default path. This document notes the inconsistency (Appendix A, item 1) but uses `storm_model_v1.pkl` as the working assumption.

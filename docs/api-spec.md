# API Specification
## Storm Prediction — Phase 2

---

## Assumptions

- All REST endpoints are prefixed with `/api/v1/`.
- All request and response bodies are `application/json`.
- All timestamps in responses are ISO 8601 UTC strings: `"2026-04-11T15:30:00"`.
- Authentication for the sensor ingest endpoint: `X-API-Key` header, value matches `SENSOR_API_KEY` env var.
- The settings and management endpoints are not authenticated beyond local network access in Phase 2 (no login required; security is LAN access control).
- Pagination uses `limit` + `offset` query parameters.
- The WebSocket endpoint has no authentication in Phase 2.
- Float values in responses are rounded to 4 decimal places maximum.
- `source` field values: `sensor`, `simulator`, `manual`.

---

## REST Endpoints

---

### POST `/api/v1/readings/`

Ingest a sensor reading. Triggers ML prediction and alert evaluation.

**Auth:** `X-API-Key` header required.

**Request body:**
```json
{
  "timestamp": "2026-04-11T15:30:00",
  "pressure_hPa": 1005.2,
  "temperature_C": 28.1,
  "source": "sensor"
}
```

`source` is optional; defaults to `"sensor"`.

**Responses:**

`201 Created`
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

`201 Created` — buffer not yet full:
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

`201 Created` — model not loaded:
```json
{
  "reading_id": 144,
  "prediction": null,
  "prediction_status": "model_unavailable",
  "alerts_triggered": 0,
  "status": "ok"
}
```

`400 Bad Request` — validation failure:
```json
{
  "error": "validation_failed",
  "detail": { "pressure_hPa": ["This field is required."] }
}
```

`401 Unauthorized`:
```json
{ "error": "invalid_api_key" }
```

`409 Conflict` — duplicate timestamp:
```json
{
  "error": "duplicate_timestamp",
  "detail": "A reading with timestamp 2026-04-11T15:30:00 already exists."
}
```

---

### GET `/api/v1/readings/`

Retrieve sensor reading history.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `hours` | int | 24 | Readings from last N hours |
| `limit` | int | 500 | Max rows returned |
| `offset` | int | 0 | Pagination offset |
| `source` | str | (all) | Filter by source |

**Response `200 OK`:**
```json
{
  "count": 48,
  "readings": [
    {
      "id": 142,
      "timestamp": "2026-04-11T15:30:00",
      "pressure_hPa": 1005.2,
      "temperature_C": 28.1,
      "received_at": "2026-04-11T15:30:03",
      "source": "sensor"
    }
  ]
}
```

---

### GET `/api/v1/predictions/latest/`

Returns the most recent prediction.

**Response `200 OK`:**
```json
{
  "id": 98,
  "reading_id": 142,
  "storm_probability": 0.7832,
  "prediction": 1,
  "risk_level": "HIGH",
  "decision_threshold": 0.5,
  "created_at": "2026-04-11T15:30:03"
}
```

**Response `200 OK` — no predictions yet:**
```json
{
  "id": null,
  "storm_probability": null,
  "risk_level": null,
  "status": "no_predictions"
}
```

---

### GET `/api/v1/predictions/`

Retrieve prediction history.

**Query parameters:** `hours` (default 24), `limit` (default 500), `offset` (default 0).

**Response `200 OK`:**
```json
{
  "count": 46,
  "predictions": [
    {
      "id": 98,
      "reading_id": 142,
      "storm_probability": 0.7832,
      "prediction": 1,
      "risk_level": "HIGH",
      "created_at": "2026-04-11T15:30:03"
    }
  ]
}
```

---

### GET `/api/v1/alerts/`

Retrieve alert event history.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `hours` | int | 24 | Events from last N hours |
| `rule_type` | str | (all) | Filter by rule type |
| `severity` | str | (all) | Filter by severity |
| `whatsapp_status` | str | (all) | Filter by send status |
| `limit` | int | 100 | Max rows |
| `offset` | int | 0 | Pagination offset |

**Response `200 OK`:**
```json
{
  "count": 3,
  "alerts": [
    {
      "id": 17,
      "rule_type": "STORM_PROBABILITY",
      "severity": "HIGH",
      "triggered_value": 0.7832,
      "threshold_value": 0.7,
      "message": "⚠️ Storm Alert: Storm probability is 78% ...",
      "whatsapp_status": "SENT",
      "created_at": "2026-04-11T15:30:04",
      "sent_at": "2026-04-11T15:30:35"
    }
  ]
}
```

---

### GET `/api/v1/alert-rules/`

Returns all alert rules and their current configuration.

**Response `200 OK`:**
```json
{
  "rules": [
    {
      "id": 1,
      "rule_type": "STORM_PROBABILITY",
      "name": "Storm Probability Alert",
      "threshold_value": 0.7,
      "severity": "HIGH",
      "enabled": true,
      "cooldown_minutes": 30,
      "message_template": "⚠️ Storm Alert: Storm probability is {probability:.0%}..."
    }
  ]
}
```

---

### PATCH `/api/v1/alert-rules/{id}/`

Update a single alert rule. Partial update — only send fields you want to change.

**Request body (all optional):**
```json
{
  "threshold_value": 0.65,
  "enabled": true,
  "cooldown_minutes": 45,
  "message_template": "Custom message with {probability:.0%} probability."
}
```

**Response `200 OK`:** Updated rule object (same shape as GET list item).

**Response `400 Bad Request`:**
```json
{ "error": "validation_failed", "detail": { "cooldown_minutes": ["Must be a positive integer."] } }
```

---

### GET `/api/v1/settings/`

Returns all system settings.

**Response `200 OK`:**
```json
{
  "settings": [
    {
      "key": "storm_probability_threshold",
      "value": "0.70",
      "value_type": "float",
      "description": "Min storm probability to trigger alert",
      "updated_at": "2026-04-11T10:00:00"
    }
  ]
}
```

---

### PUT `/api/v1/settings/{key}/`

Update a single setting value.

**Request body:**
```json
{ "value": "0.65" }
```

Value is always sent as a string. The server casts it using `value_type`.

**Response `200 OK`:**
```json
{
  "key": "storm_probability_threshold",
  "value": "0.65",
  "value_type": "float",
  "updated_at": "2026-04-11T15:45:00"
}
```

**Response `400 Bad Request`:**
```json
{ "error": "invalid_value", "detail": "Cannot cast '0.x' to float." }
```

**Response `404 Not Found`:**
```json
{ "error": "setting_not_found", "key": "nonexistent_key" }
```

---

### GET `/api/v1/whatsapp/recipients/`

Returns all recipients.

**Response `200 OK`:**
```json
{
  "recipients": [
    {
      "id": 1,
      "name": "Talha",
      "phone": "+923001234567",
      "active": true,
      "notes": "",
      "created_at": "2026-04-11T09:00:00"
    }
  ]
}
```

---

### POST `/api/v1/whatsapp/recipients/`

Add a new recipient.

**Request body:**
```json
{
  "name": "Operator Name",
  "phone": "+923001234567",
  "active": true,
  "notes": "Primary contact"
}
```

**Response `201 Created`:** Created recipient object.

**Response `400 Bad Request`:**
```json
{ "error": "validation_failed", "detail": { "phone": ["Must be in E.164 format: +[country][number]"] } }
```

**Response `409 Conflict`:**
```json
{ "error": "duplicate_phone", "detail": "Phone +923001234567 is already registered." }
```

---

### PATCH `/api/v1/whatsapp/recipients/{id}/`

Update a recipient (typically toggling `active`).

**Request body (partial):**
```json
{ "active": false }
```

**Response `200 OK`:** Updated recipient object.

---

### DELETE `/api/v1/whatsapp/recipients/{id}/`

Delete a recipient. Associated `WhatsAppSendLog` rows retain the phone number via denormalized column.

**Response `204 No Content`**

---

### GET `/api/v1/whatsapp/status/`

Returns WhatsApp operational status.

**Response `200 OK`:**
```json
{
  "browser_ready": true,
  "last_confirmed_at": "2026-04-11T09:15:00",
  "confirmed_by": "Talha",
  "alerts_enabled": true,
  "stale_warning": false,
  "stale_threshold_hours": 4,
  "pending_send_count": 0,
  "failed_send_count_24h": 1
}
```

`stale_warning` is `true` when `browser_ready = true` and `last_confirmed_at` is more than 4 hours ago.

---

### POST `/api/v1/whatsapp/status/set-ready/`

Set WhatsApp Web readiness flag.

**Request body:**
```json
{
  "ready": true,
  "confirmed_by": "Talha"
}
```

**Response `200 OK`:**
```json
{
  "browser_ready": true,
  "last_confirmed_at": "2026-04-11T15:50:00",
  "confirmed_by": "Talha"
}
```

---

### POST `/api/v1/whatsapp/test-send/`

Send a test WhatsApp message to a specific recipient immediately. Blocks until pywhatkit returns (up to 30 seconds). Use with intent.

**Request body:**
```json
{
  "recipient_id": 1,
  "message": "Test message from Storm Prediction System."
}
```

**Response `200 OK`:**
```json
{
  "log_id": 45,
  "status": "SUCCESS",
  "phone": "+923001234567"
}
```

**Response `200 OK` — send failed:**
```json
{
  "log_id": 46,
  "status": "FAILED",
  "phone": "+923001234567",
  "error": "pywhatkit exception: ..."
}
```

**Response `200 OK` — browser not ready:**
```json
{
  "log_id": 47,
  "status": "MANUAL_CHECK_NEEDED",
  "phone": "+923001234567",
  "error": "WhatsApp Web not marked as ready. Mark as ready first."
}
```

**Response `404 Not Found`:** Recipient ID does not exist.

---

### GET `/api/v1/whatsapp/send-log/`

Returns recent send log entries.

**Query parameters:** `hours` (default 24), `limit` (default 100), `offset` (default 0), `status` (filter).

**Response `200 OK`:**
```json
{
  "count": 12,
  "logs": [
    {
      "id": 45,
      "phone": "+923001234567",
      "message": "⚠️ Storm Alert...",
      "status": "SUCCESS",
      "error_message": null,
      "attempted_at": "2026-04-11T15:30:35",
      "is_test": false,
      "alert_event_id": 17,
      "recipient_id": 1
    }
  ]
}
```

---

### POST `/api/v1/alerts/{id}/retry/`

Retry WhatsApp sending for a specific alert event that is `FAILED` or `MANUAL_CHECK_NEEDED`. Creates new `WhatsAppSendLog` rows; does not create a new `AlertEvent`.

**Response `200 OK`:**
```json
{
  "alert_event_id": 17,
  "recipients_attempted": 2,
  "results": [
    { "recipient_id": 1, "phone": "+923001234567", "status": "SUCCESS", "log_id": 50 },
    { "recipient_id": 2, "phone": "+923009876543", "status": "FAILED",  "log_id": 51 }
  ]
}
```

---

## WebSocket Endpoint

### `WS /ws/dashboard/`

Server-to-client only. The browser does not send messages.

**Connection:** Standard WebSocket upgrade. No auth token required in Phase 2.

**Reconnect behaviour:** Client-side JavaScript reconnects after 3-second delay on disconnect.

---

**Message type: `sensor.update`**

Sent after every successfully processed sensor reading.

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

When buffering:
```json
{
  "type": "sensor.update",
  "reading": { "id": 3, "timestamp": "...", "pressure_hPa": 1005.2, "temperature_C": 28.1 },
  "prediction": null,
  "prediction_status": "buffering",
  "alerts": []
}
```

---

## URL Configuration

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

```python
# apps/sensor_ingest/urls.py
urlpatterns = [
    path("readings/", ReadingIngestView.as_view()),
]

# apps/predictions/urls.py
urlpatterns = [
    path("predictions/", PredictionListView.as_view()),
    path("predictions/latest/", PredictionLatestView.as_view()),
]

# apps/alerting/urls.py
urlpatterns = [
    path("alerts/", AlertEventListView.as_view()),
    path("alerts/<int:pk>/retry/", AlertRetryView.as_view()),
    path("alert-rules/", AlertRuleListView.as_view()),
    path("alert-rules/<int:pk>/", AlertRuleDetailView.as_view()),
]

# apps/whatsapp_integration/urls.py
urlpatterns = [
    path("whatsapp/recipients/", RecipientListCreateView.as_view()),
    path("whatsapp/recipients/<int:pk>/", RecipientDetailView.as_view()),
    path("whatsapp/status/", WhatsAppStatusView.as_view()),
    path("whatsapp/status/set-ready/", SetReadyView.as_view()),
    path("whatsapp/test-send/", TestSendView.as_view()),
    path("whatsapp/send-log/", SendLogView.as_view()),
]

# apps/settings_manager/urls.py
urlpatterns = [
    path("settings/", SettingsListView.as_view()),
    path("settings/<str:key>/", SettingsDetailView.as_view()),
]
```

---

## API Key Middleware

Implemented as a decorator applied only to `ReadingIngestView`:

```python
# apps/sensor_ingest/auth.py
from django.conf import settings
from functools import wraps
from django.http import JsonResponse

def require_api_key(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        key = request.headers.get("X-API-Key", "")
        if key != settings.SENSOR_API_KEY:
            return JsonResponse({"error": "invalid_api_key"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper
```

All other endpoints rely on LAN access control only in Phase 2.

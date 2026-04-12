# Frontend Pages
## Storm Prediction — Phase 2

---

## Assumptions

- All pages use Django Templates (server-side rendering). No SPA framework.
- Bootstrap 5.3 loaded from CDN. No npm build step.
- Chart.js 4.x loaded from CDN.
- Vanilla JavaScript only. No React, Vue, or jQuery.
- All data for initial page load is fetched via JavaScript `fetch()` after DOM ready, calling the REST API.
- WebSocket connection is established on the dashboard page only.
- Pages are accessible at the root URL; no login required in Phase 2.
- Responsive layout (Bootstrap grid). Minimum target: 1024px wide desktop browser.
- All chart timestamps are displayed in local browser time (JavaScript `Date` handles conversion from UTC ISO strings).

---

## Base Template — `templates/base.html`

Defines the shared layout for all pages.

**Structure:**
- `<head>`: Bootstrap 5 CSS CDN, Chart.js CDN, `custom.css`, `{% block extra_head %}`
- Top navbar:
  - Brand: "Storm Prediction"
  - Links: Dashboard (`/`), Alerts (`/alerts/`), WhatsApp (`/whatsapp/`), Recipients (`/whatsapp/recipients/`), Settings (`/settings/`)
  - Right side: live connection indicator dot (green/grey, updated by `dashboard.js`)
- `<main>`: `{% block content %}`
- `<footer>`: "Storm Prediction System — Local Deployment" + server time
- End of body: `{% block extra_js %}`

**Connection indicator logic (`dashboard.js`):**
- Green dot when WebSocket is `OPEN`.
- Grey dot when `CLOSED` or `CONNECTING`.
- Updated on WebSocket `onopen` / `onclose` events.

---

## Page 1 — Main Dashboard

**URL:** `/`
**Django view:** `dashboard.views.DashboardView`
**Template:** `templates/dashboard/index.html`

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  NAVBAR                                                        │
├──────────────────┬─────────────────────────────────────────────┤
│  Risk Status     │  Pressure Chart (last 24h)                  │
│  Card            ├─────────────────────────────────────────────┤
│                  │  Temperature Chart (last 24h)               │
├──────────────────┴─────────────────────────────────────────────┤
│  Recent Alerts (last 5 rows)                                   │
└────────────────────────────────────────────────────────────────┘
```

### Risk Status Card

- Full-width coloured card at top-left. Background colour:
  - `LOW` → Bootstrap `bg-success` (green)
  - `MEDIUM` → Bootstrap `bg-warning` (amber)
  - `HIGH` → Bootstrap `bg-danger` (red)
  - `BUFFERING` → Bootstrap `bg-secondary` (grey)
  - `UNAVAILABLE` → Bootstrap `bg-dark` (black)
- Contents:
  - Large risk label text: `LOW` / `MEDIUM` / `HIGH` / `BUFFERING` / `MODEL UNAVAILABLE`
  - Storm probability: `78%` (shown only when prediction available)
  - Last reading: `Pressure: 1005.2 hPa | Temp: 28.1°C`
  - Timestamp: `Last reading: 15:30:00`
- Updated by WebSocket `sensor.update` messages.

### Pressure Chart

- Chart.js `line` chart.
- X-axis: timestamps (last 24 hours, loaded initially from `GET /api/v1/readings/?hours=24`).
- Y-axis: pressure in hPa.
- Dataset 1: `Pressure (hPa)` — blue line.
- Dataset 2 (fake horizontal line): `High Threshold` — red dashed, value from settings passed in Django template context.
- Dataset 3 (fake horizontal line): `Low Threshold` — orange dashed.
- Max points displayed: 500. When exceeded, shift oldest from front.
- New points appended from WebSocket messages.

### Temperature Chart

- Identical structure to pressure chart.
- Y-axis: temperature in °C.
- Threshold lines for `temperature_high_threshold` and `temperature_low_threshold`.

### Recent Alerts Panel

- Bootstrap table with 5 rows max.
- Columns: Time, Type, Severity, Message (truncated at 80 chars), WhatsApp Status badge.
- Severity badge colours: LOW=grey, MEDIUM=amber, HIGH=red, CRITICAL=dark red.
- WhatsApp status badge colours: SENT=green, FAILED=red, PENDING=amber, SKIPPED=grey, MANUAL_CHECK_NEEDED=orange.
- Loaded on page load via `GET /api/v1/alerts/?limit=5`.
- Updated when WebSocket `sensor.update` includes `alerts` with length > 0 (prepend new row, remove last).
- Link at bottom: "View full alert history →" → `/alerts/`

### Data fetched at page load

```javascript
// dashboard.js — onDOMContentLoaded
Promise.all([
  fetch('/api/v1/readings/?hours=24&limit=500'),
  fetch('/api/v1/predictions/latest/'),
  fetch('/api/v1/alerts/?limit=5'),
  // threshold values come from Django template context ({{ pressure_high_threshold }})
]).then(([readingsResp, predResp, alertsResp]) => {
  // populate charts, risk card, alerts table
})
```

### WebSocket logic

```javascript
// dashboard.js
function connectWebSocket() {
  const ws = new WebSocket(`ws://${location.host}/ws/dashboard/`);

  ws.onopen = () => { setIndicator('green'); };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'sensor.update') {
      appendChartPoint(data.reading);
      updateRiskCard(data.prediction, data.prediction_status);
      if (data.alerts.length > 0) prependAlertRow(data.alerts[0]);
    }
  };

  ws.onclose = () => {
    setIndicator('grey');
    setTimeout(connectWebSocket, 3000); // auto-reconnect
  };
}
```

### Django view context

```python
class DashboardView(TemplateView):
    template_name = "dashboard/index.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx['pressure_high_threshold'] = SystemSetting.get_value('pressure_high_threshold', 1030.0)
        ctx['pressure_low_threshold']  = SystemSetting.get_value('pressure_low_threshold', 990.0)
        ctx['temperature_high_threshold'] = SystemSetting.get_value('temperature_high_threshold', 40.0)
        ctx['temperature_low_threshold']  = SystemSetting.get_value('temperature_low_threshold', 0.0)
        return ctx
```

---

## Page 2 — Alert History

**URL:** `/alerts/`
**Django view:** `dashboard.views.AlertHistoryView`
**Template:** `templates/dashboard/alerts.html`

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│  NAVBAR                                                       │
├───────────────────────────────────────────────────────────────┤
│  Filter bar: [Rule type ▼] [Severity ▼] [Hours: 24 ▼] [Apply]│
├───────────────────────────────────────────────────────────────┤
│  Alert table (paginated, 50 per page)                         │
│  ┌────────┬────────────┬──────────┬──────────┬──────────────┐ │
│  │ Time   │ Type       │ Severity │ Value    │ WA Status    │ │
│  ├────────┼────────────┼──────────┼──────────┼──────────────┤ │
│  │ 15:30  │ STORM_PROB │ HIGH     │ 0.78/0.7 │ SENT ✓      │ │
│  │ 14:00  │ PRES_LOW   │ MEDIUM   │ 988/990  │ FAILED ✗    │ │
│  └────────┴────────────┴──────────┴──────────┴──────────────┘ │
├───────────────────────────────────────────────────────────────┤
│  Pagination: ← Prev  Page 1 of 3  Next →                     │
└───────────────────────────────────────────────────────────────┘
```

### Columns

| Column | Content |
|--------|---------|
| Time | `created_at` formatted as `DD/MM HH:MM` |
| Type | Rule type badge (styled per type) |
| Severity | Colour-coded badge |
| Triggered / Threshold | E.g. `0.78 / 0.70` or `988 hPa / 990 hPa` |
| Message | First 100 chars; click row to expand |
| WhatsApp Status | Colour-coded badge + Retry button if FAILED or MANUAL_CHECK_NEEDED |

### Retry button

- Appears inline when `whatsapp_status` is `FAILED` or `MANUAL_CHECK_NEEDED`.
- On click: `POST /api/v1/alerts/{id}/retry/`
- On success: badge updates to `SENT`. On failure: badge stays `FAILED`, shows error tooltip.

### Filtering

- Filter form submits via GET query params: `?rule_type=STORM_PROBABILITY&severity=HIGH&hours=48`
- Django view passes params to `GET /api/v1/alerts/` API call.
- No JavaScript filtering — server-side only.

### Django view

```python
class AlertHistoryView(TemplateView):
    template_name = "dashboard/alerts.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        # Params for initial server-rendered filter state
        ctx['rule_type_choices'] = AlertRule.RULE_TYPE_CHOICES
        ctx['selected_rule_type'] = self.request.GET.get('rule_type', '')
        ctx['selected_hours'] = self.request.GET.get('hours', 24)
        return ctx
```

The table data is loaded by JavaScript calling the alerts API with the same query params.

---

## Page 3 — WhatsApp Status

**URL:** `/whatsapp/`
**Django view:** `whatsapp_integration.views.WhatsAppStatusPageView`
**Template:** `templates/whatsapp_integration/status.html`

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  NAVBAR                                                      │
├─────────────────────┬────────────────────────────────────────┤
│  Status Card        │  Setup Instructions                    │
│  ┌───────────────┐  │  1. Open Chrome on this machine        │
│  │  ● READY      │  │  2. Go to web.whatsapp.com             │
│  │  Since 09:15  │  │  3. Scan QR code with your phone       │
│  │  by: Talha    │  │  4. Keep this Chrome tab open          │
│  └───────────────┘  │  5. Click Mark as Ready below          │
│                     │                                        │
│  [Mark as Ready]    │  ⚠️ Operational Caveats                │
│  [Mark Not Ready]   │  (always visible; cannot be dismissed) │
├─────────────────────┴────────────────────────────────────────┤
│  Recent Send Log (last 10 rows)                              │
└──────────────────────────────────────────────────────────────┘
```

### Status Card

- Green bordered card when `browser_ready = true`.
- Red bordered card when `browser_ready = false`.
- Amber bordered card when `browser_ready = true` but `stale_warning = true` (>4h since confirmation).
- Contents:
  - Status dot + label: `READY` / `NOT READY` / `STALE — CONFIRM AGAIN`
  - Last confirmed timestamp (or "Never confirmed")
  - Confirmed by name

### Mark as Ready form

- Form with text input for `confirmed_by` (operator name).
- "Mark as Ready" button: `POST /api/v1/whatsapp/status/set-ready/` with `{"ready": true, "confirmed_by": "<name>"}`.
- "Mark as Not Ready" button: same endpoint with `{"ready": false}`.
- On success: page reloads to show updated status.

### Operational Caveats Box

Always visible. Styled as `alert alert-warning`. Cannot be hidden.

```
pywhatkit requires Chrome to be open with an active WhatsApp Web session
on this machine. It sends messages by opening browser tabs and using
keyboard automation. There is no automatic session detection.

This means:
• Sending stops if Chrome is closed or the session expires.
• The screen must not be locked during sends.
• Sends are sequential; multiple recipients require ~25s each.
• This is NOT a WhatsApp Business API. Reliability is limited.
```

### Recent Send Log table

- Last 10 rows from `GET /api/v1/whatsapp/send-log/?limit=10`.
- Columns: Time, Phone, Message (50 chars), Status badge.
- No retry button here (use alert history page for retries).

---

## Page 4 — Recipients Management

**URL:** `/whatsapp/recipients/`
**Django view:** `whatsapp_integration.views.RecipientsPageView`
**Template:** `templates/whatsapp_integration/recipients.html`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  NAVBAR                                                    │
├────────────────────────────────────────────────────────────┤
│  Add Recipient                                             │
│  Name: [________]  Phone: [+____________]  [Add]          │
│  Phone format: +[country code][number], no spaces or dashes│
├────────────────────────────────────────────────────────────┤
│  Recipients Table                                          │
│  ┌────────┬─────────────────┬────────┬────────┬─────────┐  │
│  │ Name   │ Phone           │ Active │ Test   │ Remove  │  │
│  ├────────┼─────────────────┼────────┼────────┼─────────┤  │
│  │ Talha  │ +923001234567   │ ON/OFF │ [Send] │ [Del]   │  │
│  └────────┴─────────────────┴────────┴────────┴─────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Add recipient form

- Inline form. `POST /api/v1/whatsapp/recipients/` via JavaScript fetch.
- On success: append new row to table without page reload.
- On failure: show inline error under the phone field.

### Active toggle

- Bootstrap toggle switch. On change: `PATCH /api/v1/whatsapp/recipients/{id}/` with `{"active": true/false}`.
- Visual state updates immediately on success.

### Test send button

- Sends to this specific recipient only: `POST /api/v1/whatsapp/test-send/` with `{"recipient_id": id, "message": "Test from Storm Prediction System."}`.
- Button shows spinner while request is in flight (blocks up to 30s).
- On return: shows toast notification with status (SUCCESS / FAILED / MANUAL_CHECK_NEEDED).

### Delete button

- Inline "Delete" link.
- Confirms with `window.confirm("Delete recipient [Name]?")`.
- `DELETE /api/v1/whatsapp/recipients/{id}/`.
- On success: remove row from table.

---

## Page 5 — Settings

**URL:** `/settings/`
**Django view:** `settings_manager.views.SettingsPageView`
**Template:** `templates/settings_manager/settings.html`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  NAVBAR                                                    │
├────────────────────────────────────────────────────────────┤
│  Storm Alert Settings                                      │
│  Storm Probability Threshold: [0.70]  (help text)         │
├────────────────────────────────────────────────────────────┤
│  Pressure Thresholds                                       │
│  High:  [1030.0] hPa                                       │
│  Low:   [990.0]  hPa                                       │
├────────────────────────────────────────────────────────────┤
│  Temperature Thresholds                                    │
│  High:  [40.0]  °C                                         │
│  Low:   [0.0]   °C                                         │
├────────────────────────────────────────────────────────────┤
│  Operational Settings                                      │
│  WhatsApp Alerts: [ENABLED ▼]                              │
│  Alert Cooldown: [30] minutes                              │
│  Dashboard History: [24] hours                             │
├────────────────────────────────────────────────────────────┤
│  [Save All Settings]                                       │
│  ✓ Settings saved. New thresholds apply to next reading.   │
└────────────────────────────────────────────────────────────┘
```

### Behaviour

- Pre-populated from `GET /api/v1/settings/` on page load.
- "Save All" button: `PUT /api/v1/settings/{key}/` for each changed field (one request per setting).
- Validation: float fields reject non-numeric input client-side before submit.
- On partial failure: show error next to the offending field; save succeeded fields are confirmed.
- Success message displayed as Bootstrap alert after save.
- Note displayed below save button: "Changes apply to the next sensor reading received."

---

## Page 6 — Sensor History

**URL:** `/history/`
**Django view:** `dashboard.views.SensorHistoryView`
**Template:** `templates/dashboard/history.html`

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  NAVBAR                                                  │
├──────────────────────────────────────────────────────────┤
│  Date range: From [____] To [____]  [Load]  [Export CSV] │
├──────────────────────────────────────────────────────────┤
│  Pressure Chart (larger: 500px height)                   │
├──────────────────────────────────────────────────────────┤
│  Temperature Chart (larger: 500px height)                │
└──────────────────────────────────────────────────────────┘
```

### Behaviour

- Default range: last 24 hours.
- "Load" fetches `GET /api/v1/readings/?hours=N&limit=500` and re-renders both charts.
- "Export CSV": `GET /api/v1/readings/?hours=N&limit=5000&format=csv` — downloads CSV file.
  - The API returns `Content-Disposition: attachment; filename=readings.csv` when `format=csv`.
- No live WebSocket on this page.

---

## Static Files

### `static/js/dashboard.js`

Responsibilities:
- `initCharts(pressureData, temperatureData, thresholds)` — creates Chart.js instances.
- `appendChartPoint(reading)` — appends a new point; shifts oldest if count > 500.
- `updateRiskCard(prediction, status)` — updates badge colour, probability text, timestamp.
- `prependAlertRow(alert)` — adds new row to recent alerts table, removes oldest.
- `connectWebSocket()` — establishes WS connection with auto-reconnect.
- `setConnectionIndicator(state)` — toggles navbar dot colour.
- `loadInitialData()` — runs on DOM ready; calls the three REST APIs.

### `static/js/alerts.js`

Responsibilities:
- `loadAlerts(params)` — fetches alert history with current filter params; renders table.
- `retryAlert(alertId, rowElement)` — calls retry API; updates badge in row.
- Filter form `change` event handler — rebuilds params, calls `loadAlerts`.
- Pagination: prev/next buttons update `offset` param.

### `static/css/custom.css`

- Risk card colour transitions.
- Navbar connection dot styles (`.ws-dot.green`, `.ws-dot.grey`).
- Severity and status badge colour overrides.
- Responsive chart container sizing.

---

## URL Configuration (`apps/dashboard/urls.py`)

```python
urlpatterns = [
    path("",           DashboardView.as_view(),      name="dashboard"),
    path("alerts/",    AlertHistoryView.as_view(),   name="alert_history"),
    path("history/",   SensorHistoryView.as_view(),  name="sensor_history"),
    path("whatsapp/",  WhatsAppStatusPageView.as_view(), name="whatsapp_status"),
    path("whatsapp/recipients/", RecipientsPageView.as_view(), name="recipients"),
    path("settings/",  SettingsPageView.as_view(),   name="settings"),
]
```

---

## WebSocket Routing (`apps/dashboard/routing.py`)

```python
from django.urls import re_path
from .consumers import DashboardConsumer

websocket_urlpatterns = [
    re_path(r"ws/dashboard/$", DashboardConsumer.as_asgi()),
]
```

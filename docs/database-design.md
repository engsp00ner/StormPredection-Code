# Database Design
## Storm Prediction — Phase 2

---

## Assumptions

- Database engine: SQLite for local deployment. All column types and constraints are PostgreSQL-compatible.
- Django ORM is used for all access. No raw SQL except for diagnostic queries.
- All timestamps are stored in UTC, as naive datetimes (SQLite does not enforce timezone; Django converts in application layer if `USE_TZ=True`).
- Soft deletes are not used. Rows are physically deleted when removed.
- The `system_settings` table always has a fixed set of rows (seeded by fixture). New keys are added only by code changes, not by user action.
- The `whatsapp_runtime_status` table always has exactly one row (singleton pattern).
- Foreign keys with `SET NULL` on delete are used where the referenced row can be deleted independently without invalidating the log.

---

## Entity Relationship Summary

```
sensor_readings ──< predictions
sensor_readings ──< alert_events
predictions     ──< alert_events (nullable)
alert_rules     ──< alert_events
alert_events    ──< whatsapp_send_log
whatsapp_recipients ──< whatsapp_send_log
```

---

## Table Definitions

### `sensor_readings`

Stores every raw reading received from the sensor or simulator.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `timestamp` | DATETIME | NOT NULL | Sensor-reported time (from payload) |
| `pressure_hpa` | FLOAT | NOT NULL | hPa; clipped 900–1100 at ingest |
| `temperature_c` | FLOAT | NOT NULL | °C; clipped −60–60 at ingest |
| `received_at` | DATETIME | NOT NULL, default now() | Server-side receipt time |
| `source` | VARCHAR(20) | NOT NULL, default `'sensor'` | `sensor`, `simulator`, `manual` |

**Indexes:** `timestamp` (for range queries); `(timestamp, source)` composite.

**Unique constraint:** `timestamp` — duplicate timestamps are rejected at the API level with HTTP 409.

**Django model name:** `SensorReading`

---

### `predictions`

Stores the ML model output for each reading where the buffer was sufficiently full.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `reading_id` | INTEGER | NOT NULL, FK → `sensor_readings.id` CASCADE DELETE | One prediction per reading |
| `storm_probability` | FLOAT | NOT NULL | 0.0–1.0 |
| `prediction` | INTEGER | NOT NULL | 0 = no storm, 1 = storm |
| `risk_level` | VARCHAR(10) | NOT NULL | `LOW`, `MEDIUM`, `HIGH` |
| `decision_threshold` | FLOAT | NOT NULL, default 0.5 | Threshold used at prediction time; stored for audit |
| `created_at` | DATETIME | NOT NULL, default now() | |

**Indexes:** `reading_id`; `created_at` DESC; `risk_level`.

**Django model name:** `Prediction`

**Note:** Not every `SensorReading` has a corresponding `Prediction`. During buffer warm-up (first 3 readings after start), no prediction is produced.

---

### `alert_rules`

Configuration for each alert type. Seeded by fixture at initial setup.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `rule_type` | VARCHAR(30) | NOT NULL, UNIQUE | See choices below |
| `name` | VARCHAR(100) | NOT NULL | Human-readable label |
| `threshold_value` | FLOAT | NOT NULL | Trigger value |
| `severity` | VARCHAR(10) | NOT NULL | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `enabled` | BOOLEAN | NOT NULL, default True | Master on/off per rule |
| `cooldown_minutes` | INTEGER | NOT NULL, default 30 | Min gap between alerts of same type |
| `message_template` | TEXT | NOT NULL | Python `.format()` string; see alerting-rules.md |
| `created_at` | DATETIME | NOT NULL, default now() | |
| `updated_at` | DATETIME | NOT NULL, auto-updated | |

**`rule_type` choices:**

| Value | Trigger condition |
|-------|-------------------|
| `STORM_PROBABILITY` | `prediction.storm_probability >= threshold_value` |
| `PRESSURE_HIGH` | `reading.pressure_hpa >= threshold_value` |
| `PRESSURE_LOW` | `reading.pressure_hpa <= threshold_value` |
| `TEMPERATURE_HIGH` | `reading.temperature_c >= threshold_value` |
| `TEMPERATURE_LOW` | `reading.temperature_c <= threshold_value` |

**Django model name:** `AlertRule`

---

### `alert_events`

One row per triggered alert. The source of truth for all alert history.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `rule_id` | INTEGER | FK → `alert_rules.id`, SET NULL | Nullable: rule may be deleted but event must persist |
| `reading_id` | INTEGER | NOT NULL, FK → `sensor_readings.id`, CASCADE DELETE | |
| `prediction_id` | INTEGER | nullable, FK → `predictions.id`, SET NULL | Null for threshold-only rules when no prediction exists |
| `rule_type` | VARCHAR(30) | NOT NULL | Denormalised from `alert_rules.rule_type` for query speed |
| `severity` | VARCHAR(10) | NOT NULL | Severity at time of trigger |
| `triggered_value` | FLOAT | NOT NULL | The actual value that crossed the threshold |
| `threshold_value` | FLOAT | NOT NULL | Threshold at time of trigger (snapshot; rule may change later) |
| `message` | TEXT | NOT NULL | Rendered message sent / to be sent |
| `whatsapp_status` | VARCHAR(25) | NOT NULL, default `PENDING` | See status choices below |
| `created_at` | DATETIME | NOT NULL, default now() | |
| `sent_at` | DATETIME | nullable | Set when final WhatsApp dispatch attempt completes |

**`whatsapp_status` choices:**

| Value | Meaning |
|-------|---------|
| `PENDING` | Not yet attempted |
| `SENT` | At least one recipient received a SUCCESS log |
| `FAILED` | All send attempts failed |
| `SKIPPED` | `whatsapp_alerts_enabled = false` or no active recipients |
| `MANUAL_CHECK_NEEDED` | Browser not marked ready; requires operator action |

**Indexes:** `created_at` DESC; `rule_type`; `whatsapp_status`; `(rule_type, created_at)` composite for cooldown queries.

**Django model name:** `AlertEvent`

---

### `whatsapp_recipients`

Phone numbers that receive WhatsApp alerts.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `name` | VARCHAR(100) | NOT NULL | Display name |
| `phone` | VARCHAR(20) | NOT NULL, UNIQUE | E.164 format: `+923001234567` |
| `active` | BOOLEAN | NOT NULL, default True | Only active recipients receive alerts |
| `notes` | TEXT | nullable | Operator notes |
| `created_at` | DATETIME | NOT NULL, default now() | |

**Django model name:** `WhatsAppRecipient`

**Validation:** Phone must match regex `^\+[1-9]\d{7,14}$` (E.164). Enforced at serializer level.

---

### `whatsapp_send_log`

One row per send attempt per recipient. Records both real alerts and test sends.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `alert_event_id` | INTEGER | nullable, FK → `alert_events.id`, SET NULL | Null for test sends |
| `recipient_id` | INTEGER | nullable, FK → `whatsapp_recipients.id`, SET NULL | Null if recipient deleted |
| `phone` | VARCHAR(20) | NOT NULL | Denormalised; recipient may be deleted later |
| `message` | TEXT | NOT NULL | Exact text sent or attempted |
| `status` | VARCHAR(25) | NOT NULL | `SUCCESS`, `FAILED`, `MANUAL_CHECK_NEEDED` |
| `error_message` | TEXT | nullable | Exception message if FAILED; max 500 chars |
| `attempted_at` | DATETIME | NOT NULL, default now() | |
| `is_test` | BOOLEAN | NOT NULL, default False | True for test sends from UI |

**Indexes:** `attempted_at` DESC; `status`; `recipient_id`; `alert_event_id`.

**Django model name:** `WhatsAppSendLog`

---

### `whatsapp_runtime_status`

Singleton table. Always exactly one row. Tracks whether the operator has confirmed that Chrome + WhatsApp Web is ready.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, always 1 | |
| `browser_ready` | BOOLEAN | NOT NULL, default False | Set by operator via UI |
| `last_confirmed_at` | DATETIME | nullable | When `browser_ready` was last set to True |
| `confirmed_by` | VARCHAR(100) | nullable | Free-text name; entered by operator on confirm |
| `notes` | TEXT | nullable | Optional operator notes |
| `updated_at` | DATETIME | NOT NULL, auto-updated | |

**Access pattern:**
```python
status = WhatsAppRuntimeStatus.objects.get_or_create(id=1)[0]
```

**Staleness rule:** If `last_confirmed_at` is more than 4 hours ago, the UI shows a warning. The `browser_ready` flag is NOT automatically set to False — the operator must explicitly mark not ready.

**Django model name:** `WhatsAppRuntimeStatus`

---

### `system_settings`

Key-value configuration table. Rows are seeded by fixture and updated via the settings UI. No rows are created dynamically.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK, autoincrement | |
| `key` | VARCHAR(100) | NOT NULL, UNIQUE | Lookup key |
| `value` | TEXT | NOT NULL | Stored as string; cast by `value_type` |
| `value_type` | VARCHAR(5) | NOT NULL, default `str` | `str`, `int`, `float`, `bool` |
| `description` | TEXT | nullable | Shown as help text in settings UI |
| `updated_at` | DATETIME | NOT NULL, auto-updated | |

**Django model name:** `SystemSetting`

**Classmethods:**
```python
SystemSetting.get_value(key: str, default=None) -> Any
SystemSetting.set_value(key: str, value: Any) -> None
```

**Seeded rows:**

| `key` | `value` | `value_type` | Description |
|-------|---------|--------------|-------------|
| `storm_probability_threshold` | `0.70` | `float` | Min storm probability to trigger alert |
| `pressure_high_threshold` | `1030.0` | `float` | hPa upper threshold |
| `pressure_low_threshold` | `990.0` | `float` | hPa lower threshold |
| `temperature_high_threshold` | `40.0` | `float` | °C upper threshold |
| `temperature_low_threshold` | `0.0` | `float` | °C lower threshold |
| `alert_cooldown_minutes` | `30` | `int` | Default cooldown; overridden per rule |
| `whatsapp_alerts_enabled` | `true` | `bool` | Master WhatsApp send switch |
| `dashboard_history_hours` | `24` | `int` | Hours of data shown on dashboard chart init |
| `model_buffer_size` | `12` | `int` | `StormPredictor` deque maxlen |

---

## Fixture File

`storm_webapp/fixtures/initial_data.json` must seed:

1. All 9 `SystemSetting` rows.
2. All 5 `AlertRule` rows with default thresholds and message templates.
3. One `WhatsAppRuntimeStatus` row with `id=1`, `browser_ready=False`.

Load with:
```bash
python manage.py loaddata fixtures/initial_data.json
```

---

## Migration Strategy

- Every schema change requires a new migration file via `manage.py makemigrations`.
- Do not edit existing migration files once applied.
- Before the first `migrate`, confirm `STORM_MODEL_PATH` resolves to a valid file (the model is loaded at startup by `AppConfig.ready()`).

## Upgrade Path to PostgreSQL

Replace `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/storm_prediction
```

Install `psycopg2-binary` and run `migrate` on the new database. All column types are compatible. Load fixtures again on the new DB.

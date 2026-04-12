# Operational Runbook
## Storm Prediction — Phase 2 Local Deployment

---

## Scope

This runbook covers day-to-day operation of the Storm Prediction web application on a local Windows or Linux desktop machine. It addresses starting the system, validating it is healthy, responding to failures, and maintaining the WhatsApp Web session.

---

## Machine Requirements

| Requirement | Detail |
|-------------|--------|
| OS | Windows 10/11 or Ubuntu Desktop (with display) |
| Python | 3.11 or higher |
| Chrome | Installed; used by pywhatkit for WhatsApp Web |
| Screen | Must have an active desktop session; screen must not be locked during WhatsApp sends |
| RAM | Minimum 4 GB |
| Storage | 500 MB free (model, DB, logs) |
| Network | Must be reachable by the ESP32 (same LAN or same machine) |

---

## Pre-Start Checklist (First Time Only)

Run these steps once when setting up on a new machine.

```
□ 1. Verify Python 3.11+:
       python --version

□ 2. Install dependencies:
       cd storm_webapp
       pip install -r requirements_webapp.txt

□ 3. Create .env file:
       copy .env.example .env   (Windows)
       cp .env.example .env     (Linux)
       Edit .env: set DJANGO_SECRET_KEY and SENSOR_API_KEY

□ 4. Verify model file exists:
       python -c "from django.conf import settings; import os; print(os.path.exists(settings.STORM_MODEL_PATH))"
       Must print: True

□ 5. Run migrations:
       python manage.py migrate

□ 6. Load initial data:
       python manage.py loaddata fixtures/initial_data.json

□ 7. Create admin user (optional, for /admin/ access):
       python manage.py createsuperuser

□ 8. Verify Django check:
       python manage.py check
       Must output: System check identified no issues (0 silenced).
```

---

## Daily Startup Procedure

Perform in this exact order every time you start the system.

### Step 1 — Open Chrome and log in to WhatsApp Web

```
1. Open Chrome on this machine.
2. Navigate to: https://web.whatsapp.com
3. If QR code is shown:
     a. Open WhatsApp on your phone.
     b. Tap: Menu → Linked Devices → Link a Device.
     c. Scan the QR code.
     d. Wait for the chat list to load in Chrome.
4. Confirm your chat list is visible in Chrome.
5. Do NOT close this tab. Minimise if needed.
```

### Step 2 — Start Django (ASGI server)

```bash
cd storm_webapp
daphne -p 8000 storm_webapp.asgi:application
```

For LAN access (ESP32 on same network):
```bash
daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application
```

Expected startup log lines (within 5 seconds):
```
INFO ml_engine StormPredictor loaded from .../storm_model_v1.pkl
Django version 5.x.x, using settings 'storm_webapp.settings.local'
Starting ASGI/Daphne version 4.x.x development server at http://0.0.0.0:8000/
```

If you see `ERROR ml_engine Failed to load model: ...` — see Fault: Model Not Loading below.

### Step 3 — Confirm WhatsApp Web readiness

```
1. Open browser: http://localhost:8000/whatsapp/
2. If status shows NOT READY or STALE:
     a. Enter your name in the "Confirmed by" field.
     b. Click "Mark as Ready".
     c. Status card must change to READY (green).
3. Confirm that Chrome still has the WhatsApp Web tab open.
```

### Step 4 — Verify a test message (recommended daily)

```
1. Go to: http://localhost:8000/whatsapp/recipients/
2. Find any active recipient.
3. Click "Send Test".
4. Wait up to 35 seconds for the result.
5. Result must show "SUCCESS" or a specific error.
6. Check your WhatsApp phone — the test message should have arrived.
```

If test send shows MANUAL_CHECK_NEEDED: browser_ready is False. Return to Step 3.
If test send shows FAILED: see Fault: WhatsApp Send Failing below.

### Step 5 — Verify dashboard

```
1. Open browser: http://localhost:8000/
2. Confirm connection indicator dot (top right of navbar) is GREEN.
3. If dot is grey: wait 5 seconds; it should reconnect automatically.
4. Optionally run the simulator to verify live chart updates:
     python tools/sensor_simulator.py --interval 5 --mode normal
   Charts should update every 5 seconds.
```

---

## System Health Indicators

| Indicator | Location | Healthy state | Action if unhealthy |
|-----------|----------|---------------|---------------------|
| Connection dot | Dashboard navbar | Green | Restart Daphne; reload browser |
| Risk card | Dashboard | Shows a risk level or "BUFFERING" | BUFFERING is normal for first 3 readings after restart |
| Charts | Dashboard | Show data points | If empty: check ingest API; check readings in DB |
| WhatsApp status | `/whatsapp/` | READY (green) | Follow Step 3 of Daily Startup |
| Stale warning | `/whatsapp/` | Not shown | Re-confirm readiness |
| Recent send log | `/whatsapp/` | SUCCESS entries | See WhatsApp fault section |
| Alert history | `/alerts/` | Events present when thresholds crossed | Check alert rules at `/settings/` |
| Django console | Terminal | No ERROR lines | Read error; see fault section |

---

## Fault: Server Will Not Start

**Symptom:** `daphne` exits immediately or shows an error.

**Checks:**
```bash
# 1. Verify settings load correctly
python manage.py check

# 2. Verify no syntax errors in settings files
python -c "import storm_webapp.settings.local"

# 3. Verify model path
python -c "from django.conf import settings; print(settings.STORM_MODEL_PATH)"

# 4. Check port not in use
# Windows:
netstat -ano | findstr :8000
# Linux:
ss -tlnp | grep 8000
```

**Resolution:**
- `System check failed`: read the listed errors; fix each one.
- Port in use: kill the process using port 8000 or change to `-p 8001`.
- Model not found: verify `STORM_MODEL_PATH` in `.env` points to the correct `.pkl` file.

---

## Fault: Model Not Loading

**Symptom:** Startup log shows `ERROR ml_engine Failed to load model: ...`

**Effect:** All readings are accepted and stored. Predictions return `null`. No `STORM_PROBABILITY` alerts fire. Threshold alerts (pressure, temperature) still fire.

**Resolution:**
1. Check the model file path: `python -c "from django.conf import settings; print(settings.STORM_MODEL_PATH)"`.
2. Verify the file exists at that path.
3. If file is missing: re-run Phase 1 training pipeline (`python src/train.py ...`) to regenerate `models/storm_model_v1.pkl`.
4. Restart Daphne.

---

## Fault: WebSocket Not Connecting

**Symptom:** Dashboard connection dot stays grey; charts do not update live.

**Checks:**
1. Is Daphne running (not `runserver`)? `runserver` does not fully support Channels WebSocket.
2. Is the browser URL the same host/port as Daphne? (e.g., `localhost:8000` vs `127.0.0.1:8000` are treated the same, but LAN IP vs localhost differ).
3. Browser DevTools → Network tab → filter by WS — is there a 101 upgrade response?
4. Browser DevTools → Console — any errors mentioning WebSocket?

**Resolution:**
- Use `daphne` not `runserver`.
- Ensure `ASGI_APPLICATION = "storm_webapp.asgi.application"` is in settings.
- Ensure `CHANNEL_LAYERS` is configured in settings.
- If on LAN: use the server's IP address in the browser, not `localhost`.

---

## Fault: Sensor Readings Not Arriving

**Symptom:** Dashboard shows no new data; charts not updating; no new rows in DB.

**Checks:**
```bash
# Test the API manually:
curl -X POST http://localhost:8000/api/v1/readings/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"timestamp":"2026-04-11T15:00:00","pressure_hPa":1010.0,"temperature_C":22.0}'
# Must return 201
```

**Resolution:**
- 401: `X-API-Key` header wrong or missing. Check `SENSOR_API_KEY` in `.env` and on the ESP32.
- 400 with validation error: payload format incorrect. Check `docs/api-spec.md` for correct field names.
- Connection refused: Daphne not running, or wrong port.
- 409 duplicate timestamp: sensor is sending the same timestamp twice. Check ESP32 clock or simulator config.

---

## Fault: WhatsApp Send Failing

**Symptom:** Send log shows `FAILED` status; or `MANUAL_CHECK_NEEDED`.

### Case: `MANUAL_CHECK_NEEDED`

Browser was not marked as ready.

```
1. Go to http://localhost:8000/whatsapp/
2. Confirm Chrome WhatsApp Web tab is open and logged in.
3. Click "Mark as Ready".
4. Retry the failed alert from http://localhost:8000/alerts/
```

### Case: `FAILED` with pywhatkit exception

Common error messages and causes:

| Error message (excerpt) | Cause | Resolution |
|-------------------------|-------|-----------|
| `list index out of range` | Chrome not open or WhatsApp Web not loaded | Open Chrome; load WhatsApp Web; re-confirm ready |
| `TimeoutError` | Page load too slow | Increase `WHATSAPP_WAIT_TIME` to 30 in `.env`; restart |
| `pyautogui` fail | Screen locked during send | Unlock screen; prevent auto-lock during operation |
| `ElementNotFound` or `NoSuchElement` | WhatsApp Web UI changed (pywhatkit version mismatch) | Update pywhatkit: `pip install --upgrade pywhatkit` |
| `ConnectionRefusedError` | No internet / WhatsApp servers unreachable | Check internet connection |

### Case: Sends succeed but message not received on phone

This means pywhatkit completed without exception but the message was not delivered.

Possible causes:
- The WhatsApp Web session was logged in but the phone lost connection to WhatsApp servers.
- The message input field loaded but did not accept the message before Enter was pressed.
- The recipient's phone is off or has no internet.

Resolution:
- Check the WhatsApp Web tab manually — was the message sent in the chat?
- If not: increase `WHATSAPP_WAIT_TIME` to 25–30 seconds.
- Retry from the alerts page.

---

## Fault: Alert Not Firing

**Symptom:** Pressure dropped below threshold but no alert event was created.

**Checks:**
1. Go to `http://localhost:8000/settings/` — what is the current `pressure_low_threshold`?
2. Go to `http://localhost:8000/` — what is the current pressure reading shown?
3. Go to `http://localhost:8000/alerts/` — are there any alert events at all, or is the rule in cooldown?
4. In Django shell:
   ```python
   from apps.alerting.models import AlertRule
   rule = AlertRule.objects.get(rule_type="PRESSURE_LOW")
   print(rule.enabled, rule.threshold_value, rule.cooldown_minutes)
   ```

**Resolution:**
- Rule disabled: go to `/admin/` → AlertRule → enable it.
- Cooldown active: wait for `cooldown_minutes` since the last event of that type, then test again.
- Wrong threshold: update via `/settings/` page.
- ML model not loaded: `STORM_PROBABILITY` rule won't fire, but threshold rules should still work.

---

## Maintenance: Changing Alert Thresholds

1. Go to `http://localhost:8000/settings/`.
2. Edit the desired threshold value.
3. Click "Save All Settings".
4. Confirm message: "Settings saved. New thresholds apply to next reading."
5. No server restart required.

---

## Maintenance: Adding / Removing Recipients

1. Go to `http://localhost:8000/whatsapp/recipients/`.
2. To add: enter name and phone in E.164 format (`+[country][number]`). Click "Add".
3. To deactivate (temporarily stop alerts): toggle the "Active" switch to OFF.
4. To permanently remove: click "Delete" and confirm.

**Phone format examples:**
- Pakistan: `+923001234567`
- UK: `+447700900123`
- US: `+12025551234`
- No spaces, dashes, or brackets.

---

## Maintenance: Re-authenticating WhatsApp Web

WhatsApp Web sessions expire after several days or when the phone's WhatsApp is reinstalled.

**Sign that session expired:** Chrome shows a QR code instead of your chat list.

```
1. On phone: WhatsApp → Settings → Linked Devices.
2. Find this computer in the device list.
3. Tap it → Log Out (optional; sometimes it logs out automatically).
4. Back on Chrome at https://web.whatsapp.com — scan the new QR code.
5. Wait for chat list to appear.
6. Go to http://localhost:8000/whatsapp/ → click "Mark as Ready".
```

---

## Maintenance: Restarting the Server

When restarting Daphne (OS reboot, code update, etc.):

1. Stop Daphne: `Ctrl+C` in the terminal running Daphne.
2. Pull any code updates if applicable.
3. Run `python manage.py migrate` if there are new migrations.
4. Start Daphne again.
5. **The ML prediction buffer is empty after restart.** The first 3 readings will return `"buffering"`. This is normal. No action required.
6. Re-confirm WhatsApp readiness at `/whatsapp/` (the `browser_ready` flag persists in the DB, so it may still show READY, but confirm Chrome is actually open).

---

## Maintenance: Viewing Logs

Daphne logs are printed to the terminal (stdout/stderr). To redirect to a file:

```bash
# Windows (PowerShell)
daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application 2>&1 | Tee-Object -FilePath daphne.log

# Linux
daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application 2>&1 | tee daphne.log
```

Key log prefixes to watch for:

| Prefix | Level | Meaning |
|--------|-------|---------|
| `INFO ml_engine` | INFO | Model loaded / predictor status |
| `INFO sensor_ingest` | INFO | Reading received |
| `INFO alerting` | INFO | Alert event created |
| `WARNING whatsapp_sender` | WARNING | Browser not ready; send skipped |
| `ERROR whatsapp_sender` | ERROR | pywhatkit exception; send failed |
| `ERROR ml_engine` | ERROR | Model failed to load |

---

## Maintenance: Database Backup

SQLite database is at `storm_webapp/db.sqlite3`.

```bash
# Simple file copy backup
copy storm_webapp\db.sqlite3 backups\db_backup_%date%.sqlite3    (Windows)
cp storm_webapp/db.sqlite3 backups/db_backup_$(date +%F).sqlite3  (Linux)
```

Back up before:
- Major code updates
- Changing Django models (before migration)
- Experimenting with settings that might corrupt data

---

## Screen Lock Prevention (Critical for pywhatkit)

pywhatkit uses `pyautogui` to press Enter to send messages. If the screen is locked, `pyautogui` cannot interact with the Chrome window and the send will silently fail (no exception, but the message is not sent).

**Windows:** Settings → System → Power & Battery → Screen and sleep → Set to "Never" while the system is running.

**Linux (GNOME):** `gsettings set org.gnome.desktop.session idle-delay 0`

Restore normal sleep settings when not running the prediction system.

---

## Operational Limits of pywhatkit

The following constraints are permanent characteristics of pywhatkit, not bugs:

| Constraint | Value | Configurable? |
|------------|-------|---------------|
| Seconds per message send | ~25–35 | No (browser load time) |
| Gap between sends (same session) | 25 seconds minimum | Via `WHATSAPP_INTER_SEND_DELAY` |
| Max recipients before timing out ESP32 | ~4 (100s total) | Depends on ESP32 HTTP timeout |
| Session expiry detection | None | No; manual check only |
| Send confirmation | None | No delivery receipt |
| Concurrent sends | Not supported | No |
| Headless operation | Not supported | Requires GUI |

If these limits are not acceptable, replace `services/whatsapp_sender.py` with a Twilio or WhatsApp Business API implementation. The rest of the codebase does not need to change.

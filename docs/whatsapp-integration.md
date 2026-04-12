# WhatsApp Integration Design
## Storm Prediction — Phase 2

---

## Section 1 — Technical Design

### Architecture Position

`pywhatkit` is isolated exclusively in `services/whatsapp_sender.py`. Nothing outside this file calls `pywhatkit` directly. The alerting engine calls `WhatsAppSenderService` via a clean interface that returns a `SendResult` dataclass.

```
alerting.engine.AlertRulesEngine
        │
        └── services.whatsapp_sender.WhatsAppSenderService.send_alert(phone, message, ...)
                │
                ├── Checks WhatsAppRuntimeStatus.browser_ready
                ├── Calls pywhatkit.sendwhatmsg_instantly(...)
                ├── Catches all exceptions
                └── Writes WhatsAppSendLog row
                        │
                        └── Returns SendResult(success, error, log_id)
```

### Service Interface

```python
# services/whatsapp_sender.py

from dataclasses import dataclass
from typing import Optional
import logging
import pywhatkit

logger = logging.getLogger("whatsapp_sender")

@dataclass
class SendResult:
    success: bool
    error: Optional[str] = None
    log_id: Optional[int] = None


class WhatsAppSenderService:

    WAIT_TIME_SECONDS = 20     # Time for browser tab to load before sending
    TAB_CLOSE_DELAY   = 3      # Seconds before closing tab after send
    INTER_SEND_DELAY  = 25     # Mandatory sleep between sequential sends

    def send_alert(
        self,
        phone: str,
        message: str,
        alert_event_id: int = None,
        recipient_id: int = None,
        is_test: bool = False,
    ) -> SendResult:
        """
        Send a WhatsApp message via pywhatkit.
        Never raises. Always returns a SendResult.
        Writes a WhatsAppSendLog row for every attempt.
        """
        from whatsapp_integration.models import WhatsAppSendLog, WhatsAppRuntimeStatus

        status = WhatsAppRuntimeStatus.objects.get_or_create(id=1)[0]

        if not status.browser_ready:
            log = WhatsAppSendLog.objects.create(
                phone=phone,
                message=message,
                status="MANUAL_CHECK_NEEDED",
                error_message="WhatsApp Web not confirmed as ready by operator.",
                is_test=is_test,
                alert_event_id=alert_event_id,
                recipient_id=recipient_id,
            )
            logger.warning("WhatsApp send skipped: browser_ready is False for phone %s", phone)
            return SendResult(success=False, error="Browser not ready", log_id=log.id)

        try:
            pywhatkit.sendwhatmsg_instantly(
                phone_no=phone,
                message=message,
                wait_time=self.WAIT_TIME_SECONDS,
                tab_close=True,
                close_time=self.TAB_CLOSE_DELAY,
            )
            log = WhatsAppSendLog.objects.create(
                phone=phone,
                message=message,
                status="SUCCESS",
                is_test=is_test,
                alert_event_id=alert_event_id,
                recipient_id=recipient_id,
            )
            logger.info("WhatsApp sent successfully to %s", phone)
            return SendResult(success=True, log_id=log.id)

        except Exception as exc:
            log = WhatsAppSendLog.objects.create(
                phone=phone,
                message=message,
                status="FAILED",
                error_message=str(exc)[:500],
                is_test=is_test,
                alert_event_id=alert_event_id,
                recipient_id=recipient_id,
            )
            logger.error("WhatsApp send failed to %s: %s", phone, exc)
            return SendResult(success=False, error=str(exc), log_id=log.id)
```

### Sending to Multiple Recipients

Sending is always sequential. Never concurrent. Each send is followed by `time.sleep(INTER_SEND_DELAY)` before the next.

```python
# apps/alerting/engine.py — _dispatch_whatsapp method

import time
from services.whatsapp_sender import WhatsAppSenderService
from whatsapp_integration.models import WhatsAppRecipient
from settings_manager.models import SystemSetting

def _dispatch_whatsapp(alert_events):
    if not SystemSetting.get_value("whatsapp_alerts_enabled", True):
        for event in alert_events:
            event.whatsapp_status = "SKIPPED"
            event.save(update_fields=["whatsapp_status"])
        return

    recipients = list(WhatsAppRecipient.objects.filter(active=True))
    if not recipients:
        for event in alert_events:
            event.whatsapp_status = "SKIPPED"
            event.save(update_fields=["whatsapp_status"])
        return

    sender = WhatsAppSenderService()

    for event in alert_events:
        any_success = False
        any_failure = False

        for i, recipient in enumerate(recipients):
            result = sender.send_alert(
                phone=recipient.phone,
                message=event.message,
                alert_event_id=event.id,
                recipient_id=recipient.id,
            )
            if result.success:
                any_success = True
            else:
                any_failure = True

            # Mandatory delay between sends; skip after last recipient
            if i < len(recipients) - 1:
                time.sleep(WhatsAppSenderService.INTER_SEND_DELAY)

        # Determine overall event status
        if any_success and not any_failure:
            event.whatsapp_status = "SENT"
        elif any_success and any_failure:
            event.whatsapp_status = "SENT"   # partial; individual failures in send log
        else:
            # Distinguish between browser not ready and actual failure
            last_log_status = WhatsAppSendLog.objects.filter(
                alert_event_id=event.id
            ).order_by("-attempted_at").values_list("status", flat=True).first()
            event.whatsapp_status = last_log_status or "FAILED"

        from django.utils.timezone import now
        event.sent_at = now()
        event.save(update_fields=["whatsapp_status", "sent_at"])
```

### Blocking Behaviour Warning

`pywhatkit.sendwhatmsg_instantly` **blocks the calling thread** for approximately `WAIT_TIME_SECONDS + TAB_CLOSE_DELAY` seconds per recipient. With 2 recipients and a 25-second inter-send delay, the ingest view is blocked for approximately:

```
(20 + 3) + 25 + (20 + 3) = ~71 seconds
```

This is acceptable for local deployment where the ESP32 sends every 10–60 minutes. However, the ESP32 HTTP client timeout must be set to at least 120 seconds, or the sensor ingest must be made asynchronous.

**Recommended mitigation for Phase 2:** Run the WhatsApp dispatch in a background thread so the HTTP response is not blocked:

```python
# In sensor_ingest/views.py, after saving prediction:
import threading

def dispatch_async(alert_events):
    _dispatch_whatsapp(alert_events)

if alert_events:
    t = threading.Thread(target=dispatch_async, args=(alert_events,), daemon=True)
    t.start()
```

The HTTP response returns immediately. The thread handles the blocking pywhatkit calls.

### Phone Number Format

All phone numbers must be stored and passed to pywhatkit in **E.164 format**: `+[country code][number]`, no spaces, no dashes, no brackets.

Examples:
- Pakistan: `+923001234567`
- UK: `+447700900123`
- US: `+12025551234`

Validation regex applied at the serializer level: `^\+[1-9]\d{7,14}$`

### `sendwhatmsg_instantly` vs `sendwhatmsg`

| Function | Behaviour |
|----------|-----------|
| `sendwhatmsg_instantly` | Sends immediately; opens browser tab; waits `wait_time` seconds |
| `sendwhatmsg` | Schedules for a specific clock time; not suitable for alert use case |

Use `sendwhatmsg_instantly` exclusively.

---

## Section 2 — Runtime Assumptions

These are hard requirements for WhatsApp sending to work. If any are not met, sends will fail or be skipped.

| Requirement | Detail |
|-------------|--------|
| Same machine | Django and Chrome must run on the same physical machine. pywhatkit opens browser tabs on the local display. |
| GUI / display | The machine must have an active desktop session. Cannot run headless. On Windows: use a normal desktop login. On Linux: requires an Xvfb or physical display. |
| Chrome installed | Chrome or Chromium must be installed and set as the default browser, or pywhatkit must be configured to use it. |
| WhatsApp Web logged in | The user must have scanned the QR code and have an active WhatsApp Web session in Chrome. |
| Chrome tab open | The WhatsApp Web tab must remain open (not closed; minimised is acceptable). |
| Screen not locked | pyautogui (used internally by pywhatkit) cannot interact with a locked screen. The machine must not lock during sends. |
| `browser_ready = True` | The operator must have clicked "Mark as Ready" on the `/whatsapp/` page after confirming Chrome is set up. |
| `whatsapp_alerts_enabled = true` | Master switch in `system_settings` must be enabled. |
| At least one active recipient | `WhatsAppRecipient` with `active=True` must exist. |

---

## Section 3 — Operator Steps

### Initial Setup (do once)

1. Install Chrome on the Django server machine.
2. Open Chrome.
3. Navigate to `https://web.whatsapp.com`.
4. Scan the QR code with your phone (WhatsApp → Linked Devices → Link a Device).
5. Wait for the chat list to appear.
6. **Do not close this tab.**
7. Open the Storm Prediction dashboard: `http://localhost:8000/whatsapp/`.
8. Enter your name in the "Confirmed by" field.
9. Click **"Mark as Ready"**.
10. Verify the status card shows **READY** with the current timestamp.
11. Add at least one recipient: `http://localhost:8000/whatsapp/recipients/`.
12. Send a test message to verify the setup works.

### Daily Startup

1. Open Chrome (if not already open).
2. Verify WhatsApp Web tab is loaded and logged in (not showing QR code).
3. Go to `http://localhost:8000/whatsapp/`.
4. If status is READY and confirmed within 4 hours: no action needed.
5. If status is STALE (>4 hours): click "Mark as Ready" again.
6. If status is NOT READY: follow Initial Setup from step 3.

### Session Re-authentication (when QR code appears)

1. On your phone: WhatsApp → Linked Devices → Link a Device.
2. Scan the QR code shown in Chrome.
3. Wait for chat list to reload.
4. Go to `http://localhost:8000/whatsapp/` and click "Mark as Ready".

### Verifying a Send Worked

1. Go to `http://localhost:8000/whatsapp/`.
2. Check "Recent Send Log" table.
3. Status `SUCCESS` = message was dispatched by pywhatkit without exception. Note: SUCCESS means pywhatkit did not raise an error. It does not guarantee WhatsApp delivered the message.
4. Status `FAILED` = pywhatkit raised an exception. Check error message in log.
5. Status `MANUAL_CHECK_NEEDED` = browser was not marked ready at send time.

---

## Section 4 — Known Limitations

| Limitation | Impact | Cannot be fixed without replacing pywhatkit |
|------------|--------|----------------------------------------------|
| No delivery receipt | SUCCESS in the log means no exception was raised, not that WhatsApp delivered the message | Yes |
| No programmatic session detection | System cannot detect if WhatsApp Web session has expired | Yes |
| GUI dependency | Cannot run on headless servers without Xvfb + VNC | Partially mitigable with Xvfb |
| Screen lock breaks sends | pyautogui cannot press Enter if screen is locked | Yes (OS level) |
| One tab opened per send | Chrome visibly opens and closes a tab for each message | Yes |
| Sequential sends only | 5 recipients with 25s gaps = ~2.5 minutes to dispatch one alert | Yes |
| pywhatkit is not thread-safe for concurrent sends | Concurrent calls cause race conditions in tab management | Yes; mitigated by sequential design |
| Rate limiting by WhatsApp | Frequent rapid messages can trigger WhatsApp abuse detection | Partially mitigated by cooldown |
| No group message support | Only individual chat messages | Yes |
| WhatsApp session expires | Sessions typically last days to weeks | Yes; mitigated by staleness warning |
| `sendwhatmsg_instantly` timing sensitivity | On slow machines, the page may not load before pyautogui presses Enter | Tune `wait_time`; set to 25s on slow machines |

---

## Section 5 — Fallback Behaviour

These are the system behaviours when pywhatkit cannot send.

### When `browser_ready = False`

- Send is NOT attempted.
- `WhatsAppSendLog` row created with `status = MANUAL_CHECK_NEEDED`.
- `AlertEvent.whatsapp_status` set to `MANUAL_CHECK_NEEDED`.
- Alert event is still stored in the database. No alert data is lost.
- Dashboard alert panel shows the alert with amber "MANUAL CHECK NEEDED" badge.
- Operator can retry from the alerts page once browser is confirmed ready.

### When pywhatkit raises an exception

- Exception is caught in `WhatsAppSenderService.send_alert()`.
- `WhatsAppSendLog` row created with `status = FAILED`, `error_message = str(exception)[:500]`.
- `AlertEvent.whatsapp_status` set to `FAILED`.
- Error is logged to Django logger at `ERROR` level.
- No retry is attempted automatically.
- Operator can retry from the alerts page.

### When `whatsapp_alerts_enabled = false`

- No send is attempted for any alert type.
- `AlertEvent` is still created (the alert happened and is recorded).
- `AlertEvent.whatsapp_status` set to `SKIPPED`.
- Dashboard shows the alert; WhatsApp sending is just disabled.

### When there are no active recipients

- No send is attempted.
- `AlertEvent.whatsapp_status` set to `SKIPPED`.
- Alert is still recorded in history.

### When only some recipients fail

- Each recipient gets its own `WhatsAppSendLog` row.
- `AlertEvent.whatsapp_status` is set to `SENT` if at least one recipient succeeded.
- Individual failures are visible in the send log and on the alert history page.
- Operator can view which recipients failed and retry manually.

### Manual retry workflow

1. Go to `/alerts/`.
2. Find the alert with `FAILED` or `MANUAL_CHECK_NEEDED` status.
3. Click "Retry".
4. System calls `POST /api/v1/alerts/{id}/retry/`.
5. New `WhatsAppSendLog` rows are created. The original `AlertEvent` row is updated.
6. No duplicate `AlertEvent` is created.

---

## Replacing pywhatkit in the Future

If pywhatkit becomes unacceptable (which is likely for any serious deployment), replace only `services/whatsapp_sender.py`. The rest of the codebase is unaffected.

Candidates:
- **Twilio API for WhatsApp** — reliable, paid, no browser dependency.
- **WhatsApp Business API** (Meta) — official, requires business verification.
- **CallMeBot** — free webhook-based WhatsApp, simpler than Twilio.

The `WhatsAppSenderService` interface (`send_alert(phone, message, ...) -> SendResult`) must remain identical. Only the implementation inside `send_alert` changes.

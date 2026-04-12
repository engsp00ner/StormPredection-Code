# Alerting Rules
## Storm Prediction — Phase 2

---

## Assumptions

- All rule evaluation happens synchronously in `apps/alerting/engine.py`, called from the sensor ingest view after each reading is saved.
- Rules are loaded from the `AlertRule` DB table, cached for 60 seconds in a module-level dict.
- Cooldown is enforced via a DB query (not in-memory), so it survives server restarts.
- Severity escalation overrides cooldown: a higher-severity event of the same rule type will fire even within the cooldown window.
- The STORM_PROBABILITY rule only evaluates when a prediction is available (not during buffer warm-up).
- Threshold rules (PRESSURE, TEMPERATURE) evaluate on every reading regardless of prediction availability.
- Alert events are never deleted. History is permanent.
- The `message_template` column in `AlertRule` uses Python `.format()` string syntax with named keys.

---

## Rule Types

### `STORM_PROBABILITY`

**Trigger:** `prediction["storm_probability"] >= rule.threshold_value`

**Default threshold:** `0.70`

**Only evaluates when:** `prediction` is not `None` and `prediction["status"]` is not `"buffering"`.

**Severity logic:**

| `storm_probability` | Assigned severity |
|--------------------|-------------------|
| >= 0.80 | `HIGH` |
| >= 0.60 | `MEDIUM` |
| < 0.60 (but >= threshold, e.g. threshold set to 0.50) | `LOW` |

**`triggered_value`:** `storm_probability` as float.

**`threshold_value` snapshot:** `rule.threshold_value` at evaluation time.

---

### `PRESSURE_HIGH`

**Trigger:** `reading.pressure_hpa >= rule.threshold_value`

**Default threshold:** `1030.0` hPa

**Severity logic:**

| Condition | Assigned severity |
|-----------|-------------------|
| `pressure >= threshold + 10` | `CRITICAL` |
| `threshold <= pressure < threshold + 10` | `HIGH` |

**`triggered_value`:** `reading.pressure_hpa`.

---

### `PRESSURE_LOW`

**Trigger:** `reading.pressure_hpa <= rule.threshold_value`

**Default threshold:** `990.0` hPa

**Severity logic:**

| Condition | Assigned severity |
|-----------|-------------------|
| `pressure <= threshold - 10` | `HIGH` |
| `threshold - 10 < pressure <= threshold` | `MEDIUM` |

**`triggered_value`:** `reading.pressure_hpa`.

**Meteorological note:** Rapid pressure drop below 990 hPa is a strong storm precursor. This rule is independent of the ML model. It will fire even during buffer warm-up when no prediction is available.

---

### `TEMPERATURE_HIGH`

**Trigger:** `reading.temperature_c >= rule.threshold_value`

**Default threshold:** `40.0` °C

**Severity logic:**

| Condition | Assigned severity |
|-----------|-------------------|
| `temperature >= threshold + 5` | `HIGH` |
| `threshold <= temperature < threshold + 5` | `MEDIUM` |

**`triggered_value`:** `reading.temperature_c`.

---

### `TEMPERATURE_LOW`

**Trigger:** `reading.temperature_c <= rule.threshold_value`

**Default threshold:** `0.0` °C

**Severity logic:**

| Condition | Assigned severity |
|-----------|-------------------|
| `temperature <= threshold - 5` | `HIGH` |
| `threshold - 5 < temperature <= threshold` | `MEDIUM` |

**`triggered_value`:** `reading.temperature_c`.

---

## Engine Implementation

```python
# apps/alerting/engine.py

from datetime import timedelta
from django.utils.timezone import now
from .models import AlertRule, AlertEvent
from apps.sensor_ingest.models import SensorReading
from apps.predictions.models import Prediction

import logging
_cache = {"rules": None, "loaded_at": None}
CACHE_TTL_SECONDS = 60
logger = logging.getLogger("alerting")


class AlertRulesEngine:

    @classmethod
    def evaluate(cls, reading: SensorReading, prediction: dict | None) -> list[AlertEvent]:
        rules = cls._get_active_rules()
        new_events = []

        for rule in rules:
            triggered, triggered_value = cls._check_rule(rule, reading, prediction)
            if not triggered:
                continue

            severity = cls._calc_severity(rule, triggered_value)

            if cls._cooldown_applies(rule, severity):
                logger.debug("Cooldown active for rule %s; skipping", rule.rule_type)
                continue

            message = cls._render_message(rule, reading, prediction, triggered_value, severity)

            prediction_id = None
            if prediction and prediction.get("db_id"):
                prediction_id = prediction["db_id"]

            event = AlertEvent.objects.create(
                rule=rule,
                reading=reading,
                prediction_id=prediction_id,
                rule_type=rule.rule_type,
                severity=severity,
                triggered_value=triggered_value,
                threshold_value=rule.threshold_value,
                message=message,
                whatsapp_status="PENDING",
            )
            new_events.append(event)
            logger.info("AlertEvent created: rule=%s severity=%s value=%.2f",
                        rule.rule_type, severity, triggered_value)

        if new_events:
            cls._dispatch_whatsapp(new_events)

        return new_events

    @classmethod
    def _check_rule(cls, rule: AlertRule, reading: SensorReading, prediction: dict | None):
        rt = rule.rule_type

        if rt == "STORM_PROBABILITY":
            if not prediction or prediction.get("status") == "buffering":
                return False, None
            prob = prediction.get("storm_probability", 0.0)
            return prob >= rule.threshold_value, prob

        if rt == "PRESSURE_HIGH":
            return reading.pressure_hpa >= rule.threshold_value, reading.pressure_hpa

        if rt == "PRESSURE_LOW":
            return reading.pressure_hpa <= rule.threshold_value, reading.pressure_hpa

        if rt == "TEMPERATURE_HIGH":
            return reading.temperature_c >= rule.threshold_value, reading.temperature_c

        if rt == "TEMPERATURE_LOW":
            return reading.temperature_c <= rule.threshold_value, reading.temperature_c

        return False, None

    @classmethod
    def _calc_severity(cls, rule: AlertRule, triggered_value: float) -> str:
        t = rule.threshold_value
        rt = rule.rule_type

        if rt == "STORM_PROBABILITY":
            if triggered_value >= 0.80: return "HIGH"
            if triggered_value >= 0.60: return "MEDIUM"
            return "LOW"

        if rt == "PRESSURE_HIGH":
            if triggered_value >= t + 10: return "CRITICAL"
            return "HIGH"

        if rt == "PRESSURE_LOW":
            if triggered_value <= t - 10: return "HIGH"
            return "MEDIUM"

        if rt == "TEMPERATURE_HIGH":
            if triggered_value >= t + 5: return "HIGH"
            return "MEDIUM"

        if rt == "TEMPERATURE_LOW":
            if triggered_value <= t - 5: return "HIGH"
            return "MEDIUM"

        return rule.severity  # fallback to rule default

    @classmethod
    def _cooldown_applies(cls, rule: AlertRule, new_severity: str) -> bool:
        cutoff = now() - timedelta(minutes=rule.cooldown_minutes)
        last_event = (
            AlertEvent.objects
            .filter(rule_type=rule.rule_type, created_at__gte=cutoff)
            .order_by("-created_at")
            .first()
        )
        if not last_event:
            return False  # No recent event; cooldown does not apply

        # Severity escalation overrides cooldown
        rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
        if rank.get(new_severity, 0) > rank.get(last_event.severity, 0):
            return False  # Escalation — fire regardless of cooldown

        return True  # Cooldown active; same or lower severity

    @classmethod
    def _render_message(cls, rule, reading, prediction, triggered_value, severity) -> str:
        ctx = {
            "timestamp": reading.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "pressure": reading.pressure_hpa,
            "temperature": reading.temperature_c,
            "value": triggered_value,
            "threshold": rule.threshold_value,
            "severity": severity,
            "probability": prediction.get("storm_probability", 0.0) if prediction else 0.0,
            "risk_level": prediction.get("risk_level", "UNKNOWN") if prediction else "UNKNOWN",
        }
        try:
            return rule.message_template.format(**ctx)
        except (KeyError, ValueError) as e:
            logger.error("Message template render failed for rule %s: %s", rule.rule_type, e)
            return f"Alert: {rule.rule_type} triggered at {ctx['timestamp']}. Value: {triggered_value:.2f}"

    @classmethod
    def _get_active_rules(cls) -> list[AlertRule]:
        import time as _time
        if _cache["rules"] is not None:
            age = _time.time() - _cache["loaded_at"]
            if age < CACHE_TTL_SECONDS:
                return _cache["rules"]
        rules = list(AlertRule.objects.filter(enabled=True))
        _cache["rules"] = rules
        _cache["loaded_at"] = _time.time()
        return rules

    @classmethod
    def invalidate_cache(cls):
        _cache["rules"] = None
        _cache["loaded_at"] = None
```

**Cache invalidation:** Call `AlertRulesEngine.invalidate_cache()` in `AlertRule.save()` and `AlertRule.delete()` signals.

---

## Cooldown Logic Detail

```
Rule: STORM_PROBABILITY, cooldown=30min

Timeline:
  t=00:00  prob=0.75 (MEDIUM) → AlertEvent created, WhatsApp sent
  t=00:15  prob=0.78 (MEDIUM) → cooldown active, SKIPPED
  t=00:25  prob=0.85 (HIGH)   → severity escalation: cooldown BYPASSED, AlertEvent created
  t=00:30  prob=0.82 (HIGH)   → cooldown active (last event at 00:25), SKIPPED
  t=01:00  prob=0.72 (MEDIUM) → 35min since 00:25, cooldown expired, AlertEvent created
```

The cooldown window is always measured from the `created_at` of the most recent `AlertEvent` for the same `rule_type`, regardless of severity.

---

## Alert Decision Matrix

| Condition | Log AlertEvent? | Send WhatsApp? | `whatsapp_status` |
|-----------|----------------|----------------|-------------------|
| Rule triggered, cooldown passed, browser ready, recipient exists | YES | YES | `SENT` or `FAILED` |
| Rule triggered, cooldown passed, browser NOT ready | YES | NO | `MANUAL_CHECK_NEEDED` |
| Rule triggered, cooldown passed, master switch OFF | YES | NO | `SKIPPED` |
| Rule triggered, cooldown passed, no active recipients | YES | NO | `SKIPPED` |
| Rule triggered, cooldown active, same or lower severity | NO | NO | — |
| Rule triggered, cooldown active, severity escalation | YES | YES | (as above) |
| Rule disabled (`enabled=False`) | NO | NO | — |
| pywhatkit raises exception | YES | Attempted, FAILED | `FAILED` |
| Model not loaded (STORM_PROBABILITY) | NO | NO | — |
| Buffer warm-up (STORM_PROBABILITY) | NO | NO | — |

---

## Message Templates

Stored in `AlertRule.message_template`. Format keys must match the `ctx` dict in `_render_message`.

### `STORM_PROBABILITY`
```
⚠️ STORM ALERT
Storm probability: {probability:.0%} | Risk: {risk_level}
Pressure: {pressure:.1f} hPa | Temp: {temperature:.1f}°C
Time: {timestamp}
```

### `PRESSURE_HIGH`
```
📈 HIGH PRESSURE ALERT
Reading: {value:.1f} hPa (Threshold: {threshold:.1f} hPa)
Temp: {temperature:.1f}°C | Time: {timestamp}
```

### `PRESSURE_LOW`
```
📉 LOW PRESSURE ALERT
Reading: {value:.1f} hPa (Threshold: {threshold:.1f} hPa)
Low pressure may indicate incoming storm.
Temp: {temperature:.1f}°C | Time: {timestamp}
```

### `TEMPERATURE_HIGH`
```
🌡️ HIGH TEMPERATURE ALERT
Reading: {value:.1f}°C (Threshold: {threshold:.1f}°C)
Pressure: {pressure:.1f} hPa | Time: {timestamp}
```

### `TEMPERATURE_LOW`
```
❄️ LOW TEMPERATURE ALERT
Reading: {value:.1f}°C (Threshold: {threshold:.1f}°C)
Pressure: {pressure:.1f} hPa | Time: {timestamp}
```

---

## Noise / Spike Protection

### Current protection mechanisms

1. **Cooldown** (primary): once an alert fires, the same rule type is silent for `cooldown_minutes`.
2. **Duplicate timestamp rejection**: the ingest API rejects readings with the same timestamp as an existing reading (HTTP 409). A misbehaving sensor cannot flood the system with identical readings.
3. **Physical bounds clipping**: `pressure_hPa` is clipped to [900, 1100]; `temperature_C` is clipped to [−60, 60] at the ingest serializer level. Sensor glitches producing impossible values do not trigger alerts.

### Phase 2 limitation

The current design checks thresholds on raw individual readings, not rolling averages. A single anomalous reading (e.g., sensor spike to 985 hPa for one second) will trigger a PRESSURE_LOW alert if the threshold is 990 hPa.

**Acceptable for Phase 2** because:
- ESP32 with BMP280 has ±1 hPa accuracy; large spikes (>10 hPa deviation) indicate real events.
- Cooldown prevents repeated alerts from noisy sustained values.

**Phase 3 enhancement:** add a 3-reading rolling average check before threshold evaluation.

---

## AlertRule Model Signals

```python
# apps/alerting/models.py

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

@receiver(post_save, sender=AlertRule)
def invalidate_on_save(sender, **kwargs):
    AlertRulesEngine.invalidate_cache()

@receiver(post_delete, sender=AlertRule)
def invalidate_on_delete(sender, **kwargs):
    AlertRulesEngine.invalidate_cache()
```

---

## Admin Registration

```python
# apps/alerting/admin.py

@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ["rule_type", "name", "threshold_value", "severity", "enabled", "cooldown_minutes"]
    list_editable = ["threshold_value", "enabled", "cooldown_minutes"]

@admin.register(AlertEvent)
class AlertEventAdmin(admin.ModelAdmin):
    list_display = ["created_at", "rule_type", "severity", "triggered_value", "whatsapp_status"]
    list_filter  = ["rule_type", "severity", "whatsapp_status"]
    ordering     = ["-created_at"]
    readonly_fields = ["created_at", "message", "triggered_value", "threshold_value"]
```

---

## Fixture Rows for `AlertRule`

```json
[
  {
    "model": "alerting.alertrule",
    "pk": 1,
    "fields": {
      "rule_type": "STORM_PROBABILITY",
      "name": "Storm Probability Alert",
      "threshold_value": 0.70,
      "severity": "HIGH",
      "enabled": true,
      "cooldown_minutes": 30,
      "message_template": "⚠️ STORM ALERT\nStorm probability: {probability:.0%} | Risk: {risk_level}\nPressure: {pressure:.1f} hPa | Temp: {temperature:.1f}°C\nTime: {timestamp}"
    }
  },
  {
    "model": "alerting.alertrule",
    "pk": 2,
    "fields": {
      "rule_type": "PRESSURE_HIGH",
      "name": "High Pressure Alert",
      "threshold_value": 1030.0,
      "severity": "HIGH",
      "enabled": true,
      "cooldown_minutes": 60,
      "message_template": "📈 HIGH PRESSURE ALERT\nReading: {value:.1f} hPa (Threshold: {threshold:.1f} hPa)\nTemp: {temperature:.1f}°C | Time: {timestamp}"
    }
  },
  {
    "model": "alerting.alertrule",
    "pk": 3,
    "fields": {
      "rule_type": "PRESSURE_LOW",
      "name": "Low Pressure Alert",
      "threshold_value": 990.0,
      "severity": "MEDIUM",
      "enabled": true,
      "cooldown_minutes": 30,
      "message_template": "📉 LOW PRESSURE ALERT\nReading: {value:.1f} hPa (Threshold: {threshold:.1f} hPa)\nLow pressure may indicate incoming storm.\nTemp: {temperature:.1f}°C | Time: {timestamp}"
    }
  },
  {
    "model": "alerting.alertrule",
    "pk": 4,
    "fields": {
      "rule_type": "TEMPERATURE_HIGH",
      "name": "High Temperature Alert",
      "threshold_value": 40.0,
      "severity": "MEDIUM",
      "enabled": true,
      "cooldown_minutes": 60,
      "message_template": "🌡️ HIGH TEMPERATURE ALERT\nReading: {value:.1f}°C (Threshold: {threshold:.1f}°C)\nPressure: {pressure:.1f} hPa | Time: {timestamp}"
    }
  },
  {
    "model": "alerting.alertrule",
    "pk": 5,
    "fields": {
      "rule_type": "TEMPERATURE_LOW",
      "name": "Low Temperature Alert",
      "threshold_value": 0.0,
      "severity": "MEDIUM",
      "enabled": true,
      "cooldown_minutes": 60,
      "message_template": "❄️ LOW TEMPERATURE ALERT\nReading: {value:.1f}°C (Threshold: {threshold:.1f}°C)\nPressure: {pressure:.1f} hPa | Time: {timestamp}"
    }
  }
]
```

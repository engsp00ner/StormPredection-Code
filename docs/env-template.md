# Environment Variables Template
## Storm Prediction — Phase 2

---

## Usage

1. Copy `.env.example` to `.env` inside `storm_webapp/`.
2. Fill in every value marked `REQUIRED`.
3. Never commit `.env` to version control.
4. `.env.example` is committed. `.env` is in `.gitignore`.

Add to `.gitignore` in the repo root:
```
storm_webapp/.env
storm_webapp/db.sqlite3
```

---

## `.env.example`

```dotenv
# ─────────────────────────────────────────────
# DJANGO CORE
# ─────────────────────────────────────────────

# REQUIRED. Generate with: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
DJANGO_SECRET_KEY=replace-this-with-a-long-random-string

# Set to False in production. True shows error tracebacks in browser.
DJANGO_DEBUG=True

# Comma-separated list. For LAN access: add your machine's LAN IP (e.g., 192.168.1.100)
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1


# ─────────────────────────────────────────────
# ML MODEL
# ─────────────────────────────────────────────

# REQUIRED. Absolute path to the trained model file.
# On Windows: use forward slashes or double backslashes.
# Default resolves to: <repo_root>/models/storm_model_v1.pkl
# Leave blank to use the default resolution (recommended).
STORM_MODEL_PATH=


# ─────────────────────────────────────────────
# SENSOR API AUTHENTICATION
# ─────────────────────────────────────────────

# REQUIRED. Shared secret for the sensor ingest endpoint.
# The ESP32 (or simulator) must send this in the X-API-Key header.
# Change this before deploying on a LAN.
SENSOR_API_KEY=change-me-before-use


# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────

# SQLite path relative to storm_webapp/. Default: db.sqlite3 in storm_webapp/.
# For PostgreSQL: postgresql://user:password@host:5432/dbname
DATABASE_URL=sqlite:///db.sqlite3


# ─────────────────────────────────────────────
# DJANGO CHANNELS (REAL-TIME)
# ─────────────────────────────────────────────

# Use InMemoryChannelLayer for local single-process deployment (default).
# Set to True and provide REDIS_URL if you need Redis channel layer (multi-client LAN use).
USE_REDIS_CHANNEL_LAYER=False

# Only used if USE_REDIS_CHANNEL_LAYER=True
REDIS_URL=redis://127.0.0.1:6379/0


# ─────────────────────────────────────────────
# WHATSAPP / PYWHATKIT
# ─────────────────────────────────────────────

# Master enable/disable for WhatsApp sending.
# Also configurable via the /settings/ UI page (SystemSetting key: whatsapp_alerts_enabled).
# This env var only sets the default. Once loaded into DB via fixture, the DB value takes precedence.
WHATSAPP_ALERTS_ENABLED=True

# Seconds pywhatkit waits for the browser tab to load before pressing Enter.
# Increase on slow machines. Decrease if Chrome is fast. Default: 20.
WHATSAPP_WAIT_TIME=20

# Seconds between sequential sends to multiple recipients.
# Do not set below 20. WhatsApp rate limiting risk. Default: 25.
WHATSAPP_INTER_SEND_DELAY=25


# ─────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────

# DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL=INFO
```

---

## Settings Configuration in `base.py`

The following shows how each env var is consumed:

```python
# storm_webapp/storm_webapp/settings/base.py

from decouple import config, Csv
from pathlib import Path
import sys

BASE_DIR  = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
sys.path.insert(0, str(REPO_ROOT))

SECRET_KEY     = config("DJANGO_SECRET_KEY")
DEBUG          = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS  = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ML
_default_model_path = str(REPO_ROOT / "models" / "storm_model_v1.pkl")
STORM_MODEL_PATH = config("STORM_MODEL_PATH", default=_default_model_path) or _default_model_path

# Sensor API
SENSOR_API_KEY = config("SENSOR_API_KEY", default="change-me")

# WhatsApp
WHATSAPP_WAIT_TIME         = config("WHATSAPP_WAIT_TIME", default=20, cast=int)
WHATSAPP_INTER_SEND_DELAY  = config("WHATSAPP_INTER_SEND_DELAY", default=25, cast=int)

# Channel layer
USE_REDIS_CHANNEL_LAYER = config("USE_REDIS_CHANNEL_LAYER", default=False, cast=bool)
REDIS_URL = config("REDIS_URL", default="redis://127.0.0.1:6379/0")

if USE_REDIS_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG":  {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer"
        }
    }

# Logging
LOG_LEVEL = config("LOG_LEVEL", default="INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "ml_engine":        {"level": "INFO",    "propagate": True},
        "sensor_ingest":    {"level": "INFO",    "propagate": True},
        "alerting":         {"level": "INFO",    "propagate": True},
        "whatsapp_sender":  {"level": "WARNING", "propagate": True},
        "django":           {"level": "WARNING", "propagate": True},
    },
}
```

---

## Variable Reference Table

| Variable | Required | Type | Default | Purpose |
|----------|----------|------|---------|---------|
| `DJANGO_SECRET_KEY` | YES | str | — | Django session/CSRF key |
| `DJANGO_DEBUG` | no | bool | `False` | Show debug tracebacks |
| `DJANGO_ALLOWED_HOSTS` | no | str (CSV) | `localhost,127.0.0.1` | Accepted hostnames |
| `STORM_MODEL_PATH` | no | str | `<repo>/models/storm_model_v1.pkl` | Absolute path to `.pkl` |
| `SENSOR_API_KEY` | YES | str | `change-me` | Shared key for ingest API |
| `DATABASE_URL` | no | str | `sqlite:///db.sqlite3` | DB connection string |
| `USE_REDIS_CHANNEL_LAYER` | no | bool | `False` | Use Redis for channels |
| `REDIS_URL` | no | str | `redis://127.0.0.1:6379/0` | Redis connection |
| `WHATSAPP_ALERTS_ENABLED` | no | bool | `True` | Master WhatsApp switch (initial DB seed) |
| `WHATSAPP_WAIT_TIME` | no | int | `20` | pywhatkit tab load wait |
| `WHATSAPP_INTER_SEND_DELAY` | no | int | `25` | Gap between sequential sends |
| `LOG_LEVEL` | no | str | `INFO` | Root log level |

---

## LAN Deployment Additional Steps

When deploying on a local network so that other devices (ESP32, other browsers) can reach the server:

1. Find the server machine's LAN IP:
   - Windows: `ipconfig` → look for `IPv4 Address`
   - Linux: `ip addr` → look for `inet` on the LAN interface

2. Add the IP to `.env`:
   ```dotenv
   DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.100
   ```

3. Start Daphne bound to all interfaces:
   ```bash
   daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application
   ```

4. ESP32 should POST to `http://192.168.1.100:8000/api/v1/readings/`.

5. Dashboard accessible at `http://192.168.1.100:8000/`.

6. The machine running Django must remain the same machine that has Chrome with WhatsApp Web open.

# ESP32 Storm Controller Firmware

This folder contains the Arduino firmware for the ESP32 controller.

It does four jobs:

- Reads pressure and temperature from a BMP280 sensor.
- Fetches `temperature_high_threshold` from the Django web app.
- Controls the 5V fan from the ESP32 fan control pin.
- Sends readings to `POST /api/v1/readings/`.

## Files

```text
esp32-code/
  esp32-code.ino
  config.example.h
  .gitignore
```

Copy `config.example.h` to `config.h` and edit your Wi-Fi, API URL, API key, and pins.

## Arduino Libraries

Install these from Arduino IDE Library Manager:

- `ArduinoJson`
- `Adafruit BMP280 Library`
- `Adafruit Unified Sensor`

The ESP32 board package provides:

- `WiFi`
- `HTTPClient`
- `Wire`

## Hardware Wiring

BMP280 I2C:

| BMP280 | ESP32 |
| --- | --- |
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

Fan power and control:

| Fan / Supply | Connection |
| --- | --- |
| Fan 5V/VCC | 5V from breadboard power supply module |
| Fan GND | GND from breadboard power supply module |
| ESP32 GND | Same GND rail as the power supply module |
| Fan PWM/control | ESP32 `FAN_CONTROL_PIN`, default GPIO 25 |
| Fan tachometer | Optional, not used by this first firmware |

Confirm the fan's 4-pin order before connecting it. The ESP32 must not power the fan directly.

## Backend Requirements

Run Django on the LAN interface:

```powershell
cd storm_webapp
python manage.py runserver 0.0.0.0:8000
```

Set these backend values:

```text
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,<server-lan-ip>
SENSOR_API_KEY=MyStormPredectionKey
```

The ESP32 uses:

```text
GET  /api/v1/settings/
POST /api/v1/readings/
```

## Fan Behavior

The firmware reads `temperature_high_threshold` from the web app settings.

Default behavior:

```text
fan ON  when temperature >= threshold
fan OFF when temperature <= threshold - 0.5 C
```

The `0.5 C` margin is configured by `FAN_HYSTERESIS_C` and prevents fast switching near the threshold.

If the fan does not fully stop when the PWM/control pin is inactive, add a MOSFET or relay to switch the fan power line while still using the breadboard module as the 5V source.

## Upload Steps

1. Open `esp32-code.ino` in Arduino IDE.
2. Copy `config.example.h` to `config.h`.
3. Edit `config.h`.
4. Select your ESP32 board and port.
5. Upload.
6. Open Serial Monitor at `115200`.

Expected Serial output includes:

```text
Wi-Fi connected
NTP time synced
BMP280 initialized
Updated fan threshold from web app
Temperature=... Threshold=... Fan=...
API HTTP 201
```


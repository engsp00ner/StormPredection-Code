# ESP32 Controller Implementation Plan

## Goal

Build an ESP32 controller that reads pressure and temperature from a BMP280 sensor, sends those readings directly to the existing storm prediction API, stores the raw data and model decision in the database, updates the web app in real time, and controls a 5V DC brushless fan based on a temperature threshold configured from inside the web app.

The current backend already supports this flow through:

- `POST /api/v1/readings/`
- `SensorReading` database rows
- `Prediction` database rows
- alert evaluation
- dashboard WebSocket updates
- runtime settings through `GET /api/v1/settings/`

The new ESP32 responsibility is local fan control:

- If the measured temperature is above the configured threshold, turn the fan on.
- Keep the fan on while the temperature remains above the threshold.
- Turn the fan off only when the measured temperature goes below the threshold.

## Current System Fit

The ESP32 should send readings to the Django web app, not run the ML model locally.

Expected request:

```json
{
  "timestamp": "2026-04-26T20:30:00Z",
  "pressure_hPa": 1005.2,
  "temperature_C": 28.1,
  "source": "sensor"
}
```

Required endpoint:

```text
POST http://<server-ip>:8000/api/v1/readings/
```

Required headers:

```text
Content-Type: application/json
X-API-Key: <SENSOR_API_KEY>
```

Expected successful response:

```json
{
  "reading_id": 142,
  "prediction": {
    "storm_probability": 0.7832,
    "prediction": 1,
    "risk_level": "HIGH",
    "decision_threshold": 0.5
  },
  "prediction_status": "ok",
  "alerts_triggered": 1,
  "status": "ok"
}
```

During model buffer warm-up, the ESP32 may receive:

```json
{
  "prediction": null,
  "prediction_status": "buffering",
  "status": "buffering"
}
```

That is normal after server restart.

## Hardware Plan

Available components:

- ESP32 DevKit controller with Wi-Fi.
- BMP280 pressure and temperature sensor.
- Breadboard power supply module.
- Argon THRML 60mm 5V DC brushless fan.
- The fan is powered by 5V DC and supports PWM speed control with tachometer feedback through a 4-pin header.

Important safety note:

- Power the fan from the breadboard power supply module's 5V output.
- Do not power the fan from an ESP32 GPIO pin.
- Do not power the fan from the ESP32 3.3V pin.
- Use the ESP32 GPIO only for the fan control signal.
- Connect ESP32 GND and the breadboard power supply module GND together so the PWM/control signal has a shared reference.
- Verify the exact fan 4-pin header pinout before wiring. The fan is designed for a Raspberry Pi 5 fan header, so the connector order should not be guessed.

Basic wiring for I2C:

| Sensor Pin | ESP32 Pin |
| --- | --- |
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

Recommended fan power and control wiring:

| Connection | Target |
| --- | --- |
| Fan 5V/VCC | 5V output from breadboard power supply module |
| Fan GND | GND output from breadboard power supply module |
| ESP32 GND | Same GND rail as the breadboard power supply module |
| Fan PWM/control pin | ESP32 GPIO fan PWM pin, after confirming fan pinout |
| Fan tachometer pin | Optional ESP32 input pin, only if RPM feedback is needed |

Example fan control pin:

```text
GPIO 25
```

Control approach:

- Use the fan's PWM/control pin if it is accessible and the pinout is confirmed.
- Set PWM high/active when temperature is above the threshold.
- Set PWM low/inactive when temperature is below the threshold.
- If the fan does not fully stop when PWM is low, add a MOSFET or relay on the fan 5V/GND power path for guaranteed on/off control.
- Keep the breadboard power supply module as the fan's 5V power source in both cases.

## Firmware Responsibilities

The ESP32 firmware should:

1. Connect to Wi-Fi.
2. Initialize the pressure and temperature sensor.
3. Read pressure in hPa.
4. Read temperature in Celsius.
5. Fetch the fan temperature threshold from the web app settings API.
6. Compare the measured temperature with the threshold.
7. Turn the fan on when temperature is above the threshold.
8. Turn the fan off when temperature goes below the threshold.
9. Build an ISO 8601 timestamp.
10. Send a JSON payload to the Django API.
11. Include `X-API-Key`.
12. Retry safely on temporary network failures.
13. Log the API response and fan state to Serial for debugging.
14. Wait for the configured interval, then repeat.

## Fan Control Scenario

The web app owns the threshold value. The ESP32 owns the physical fan control.

Recommended setting:

```text
temperature_high_threshold
```

The backend already has this system setting and exposes settings through:

```text
GET /api/v1/settings/
```

The ESP32 should periodically fetch settings, find `temperature_high_threshold`, and store it as `fanTemperatureThresholdC`.

Control logic:

```text
if temperature_C > fanTemperatureThresholdC:
    fan ON

if temperature_C < fanTemperatureThresholdC:
    fan OFF
```

Recommended improvement to prevent fast on/off switching near the threshold:

```text
fan ON when temperature_C >= threshold
fan OFF when temperature_C <= threshold - 0.5
```

This `0.5 C` hysteresis avoids relay/MOSFET chatter when the BMP280 reading fluctuates around the threshold. If strict behavior is required, use the exact rule without hysteresis.

Fan state should also be printed to Serial:

```text
Temperature=31.2 C Threshold=30.0 C Fan=ON
Temperature=29.4 C Threshold=30.0 C Fan=OFF
```

## Threshold Sync Strategy

The ESP32 should not fetch settings on every sensor reading if the interval is short.

Recommended strategy:

- Read the BMP280 and control the fan every 2-5 seconds.
- Send readings to the backend every 30-60 seconds.
- Fetch the threshold from the backend every 30-60 seconds.
- If the settings API is unavailable, keep using the last known threshold.
- If no threshold has ever been fetched, use a firmware fallback threshold such as `30.0 C`.

Optional backend improvement:

- Add a smaller endpoint such as `GET /api/v1/settings/temperature_high_threshold/` or `GET /api/v1/device-config/`.
- Return only the settings needed by the ESP32:

```json
{
  "fan_temperature_threshold_C": 30.0,
  "reading_interval_seconds": 60
}
```

## Time Strategy

The backend requires a unique timestamp for each reading.

Use NTP on the ESP32:

- Configure time after Wi-Fi connects.
- Use UTC timestamps.
- Format timestamps like `YYYY-MM-DDTHH:MM:SSZ`.

Fallback if NTP is unavailable:

- Do not send readings until time is available, or
- Send server-side timestamp support later by changing the API to make `timestamp` optional.

The first option is safer with the current backend because duplicate or invalid timestamps will be rejected.

## Firmware Configuration

Keep these values configurable at the top of the Arduino sketch or in a separate local config header:

```cpp
const char* WIFI_SSID = "your-wifi-name";
const char* WIFI_PASSWORD = "your-wifi-password";
const char* API_BASE_URL = "http://192.168.1.10:8000";
const char* SENSOR_API_KEY = "MyStormPredectionKey";
const unsigned long READING_INTERVAL_MS = 60000;
const unsigned long THRESHOLD_REFRESH_MS = 60000;
const unsigned long FAN_CONTROL_INTERVAL_MS = 3000;
const int FAN_CONTROL_PIN = 25;
const float FALLBACK_FAN_THRESHOLD_C = 30.0;
const float FAN_HYSTERESIS_C = 0.5;
```

Use the LAN IP address of the machine running Django, not `localhost`.

## Backend Configuration Checklist

Before connecting the ESP32:

1. Run the Django app on the LAN interface:

```powershell
python manage.py runserver 0.0.0.0:8000
```

or Daphne if using the real-time ASGI stack:

```powershell
daphne -b 0.0.0.0 -p 8000 storm_webapp.asgi:application
```

2. Set `DJANGO_ALLOWED_HOSTS` to include:

```text
localhost,127.0.0.1,<server-lan-ip>
```

3. Set `SENSOR_API_KEY` in the Django environment.

4. Confirm the web app settings page can update `temperature_high_threshold`.

5. Confirm Windows Firewall allows inbound traffic on port `8000`.

6. Test from another device on the same Wi-Fi network:

```powershell
curl http://<server-lan-ip>:8000/api/v1/readings/
```

7. Test that the ESP32 can read settings:

```powershell
curl http://<server-lan-ip>:8000/api/v1/settings/
```

8. Test one POST manually before flashing the ESP32:

```powershell
curl -X POST http://<server-lan-ip>:8000/api/v1/readings/ ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: MyStormPredectionKey" ^
  -d "{\"timestamp\":\"2026-04-26T20:30:00Z\",\"pressure_hPa\":1005.2,\"temperature_C\":28.1,\"source\":\"sensor\"}"
```

## Data Flow

```text
ESP32
  -> reads pressure and temperature
  -> fetches temperature threshold from web app settings
  -> controls the 5V fan using its PWM/control pin
  -> fan receives 5V power from the breadboard power supply module
  -> sends JSON to POST /api/v1/readings/
  -> Django validates API key and payload
  -> SensorReading is saved to database
  -> StormPredictor receives the reading
  -> Prediction is saved when the buffer is ready
  -> AlertRulesEngine evaluates the reading and prediction
  -> dashboard receives sensor.update over WebSocket
  -> frontend shows latest reading, model decision, and alerts
```

## Database Result

Every valid ESP32 reading creates one row in:

```text
sensor_readings
```

When the model buffer is ready, the same request also creates one row in:

```text
predictions
```

If an alert rule is triggered, it creates one or more rows in:

```text
alert_events
```

WhatsApp send attempts are logged in:

```text
whatsapp_send_log
```

## Web App Integration

No separate frontend API is needed for the ESP32.

The ESP32 sends data to the backend API. The backend then updates the web app through the existing WebSocket dashboard flow.

The web app can also fetch history through:

```text
GET /api/v1/readings/
GET /api/v1/predictions/latest/
GET /api/v1/predictions/
GET /api/v1/alerts/
```

The ESP32 should fetch the fan threshold through:

```text
GET /api/v1/settings/
```

The threshold can be changed from the web app settings page. The ESP32 applies the new value after its next threshold refresh.

## Firmware Implementation Steps

1. Create the ESP32 firmware folder:

```text
esp32-code/
```

2. Add an Arduino sketch:

```text
esp32-code/esp32-code.ino
```

3. Install Arduino libraries:

- `WiFi`
- `HTTPClient`
- `ArduinoJson`
- `Adafruit BMP280 Library`
- `Adafruit Unified Sensor`

4. Implement Wi-Fi connection with reconnect handling.

5. Implement NTP time sync.

6. Implement sensor initialization.

7. Implement fan GPIO initialization:

```cpp
pinMode(FAN_CONTROL_PIN, OUTPUT);
digitalWrite(FAN_CONTROL_PIN, LOW);
```

If using ESP32 PWM instead of simple digital on/off:

```cpp
ledcSetup(FAN_PWM_CHANNEL, FAN_PWM_FREQUENCY, FAN_PWM_RESOLUTION);
ledcAttachPin(FAN_CONTROL_PIN, FAN_PWM_CHANNEL);
ledcWrite(FAN_PWM_CHANNEL, 0);
```

8. Implement reading conversion:

- pressure: Pa to hPa if needed
- temperature: Celsius

9. Implement threshold fetch from `GET /api/v1/settings/`.

10. Implement fan control logic:

- Fan on above threshold.
- Fan off below threshold.
- Optional hysteresis to avoid rapid switching.
- If PWM control does not stop the fan fully, switch fan power with a MOSFET or relay while still powering the fan from the breadboard supply module.

11. Implement JSON POST request.

12. Handle response codes:

| HTTP Code | Meaning | ESP32 Action |
| --- | --- | --- |
| 201 | Reading accepted | Log response and continue |
| 400 | Invalid payload | Log error; check sensor values and JSON |
| 401 | Bad API key | Stop repeated sending or slow retry |
| 409 | Duplicate timestamp | Generate a fresh timestamp and retry once |
| 500 | Server error | Retry later |
| Network failure | API unreachable | Retry with backoff |

13. Add serial output for:

- Wi-Fi state
- sensor read values
- current threshold
- fan state
- request payload
- response status
- response body

## Reliability Plan

Minimum version:

- Send each reading once.
- If sending fails, retry on the next loop.
- Keep controlling the fan even if the backend is offline.
- Use the last known threshold while offline.

Better version:

- Store failed readings in ESP32 flash using `Preferences` or SPIFFS/LittleFS.
- Retry unsent readings before sending new readings.
- Limit local queue size to avoid flash wear.

Recommended retry policy:

- Retry network failures up to 3 times.
- Use 5 seconds, 15 seconds, and 30 seconds delay.
- Then continue to the next scheduled reading.
- Do not block fan control for a long time while retrying API requests.

## Security Plan

For local Phase 2 deployment:

- Use `X-API-Key`.
- Keep the ESP32 and Django server on the same trusted LAN.
- Do not expose port `8000` to the public internet.
- Do not commit real Wi-Fi passwords or API keys.

Future improvement:

- Use HTTPS with a local reverse proxy.
- Add per-device IDs.
- Add key rotation.
- Add request signing if the system leaves the trusted LAN.

## Validation Plan

1. Run the existing simulator first:

```powershell
python tools/sensor_simulator.py --url http://<server-lan-ip>:8000 --api-key MyStormPredectionKey --interval 10
```

2. Confirm new rows appear in:

```text
sensor_readings
predictions
```

3. Confirm dashboard updates in the browser.

4. Flash ESP32 firmware.

5. Open Serial Monitor and confirm:

- Wi-Fi connected
- NTP synced
- sensor initialized
- threshold fetched from web app
- readings are realistic
- fan turns on when temperature is above threshold
- fan turns off when temperature goes below threshold
- API returns `201`

6. Compare ESP32 readings with dashboard values.

7. Change `temperature_high_threshold` in the web app and confirm the ESP32 applies the new threshold after refresh.

8. Restart Django and confirm ESP32 handles temporary failures while fan control still works locally.

9. Restart ESP32 and confirm timestamps remain valid.

## Acceptance Criteria

The ESP32 section is complete when:

- ESP32 sends real pressure and temperature readings to Django.
- The API accepts readings with HTTP `201`.
- Raw readings are saved in the database.
- Model predictions are saved once the buffer is ready.
- The API response includes the model decision.
- The dashboard updates without manual refresh.
- The ESP32 fetches the fan threshold from the web app.
- The fan turns on when temperature is above the threshold.
- The fan turns off when temperature goes below the threshold.
- The fan is powered from the breadboard power supply module's 5V output.
- The ESP32 controls only the PWM/control signal, not the fan power line.
- Invalid API keys are rejected.
- Network failure does not crash the ESP32 loop.
- Network failure does not stop local fan control.
- The setup can run continuously for at least 24 hours.

## Suggested File Additions

```text
esp32-code/
  esp32-code.ino
  README.md
  config.example.h
  .gitignore
```

Do not commit a real `config.h` containing Wi-Fi credentials or the real API key.

## Open Questions

Please confirm these before implementation:

1. Will the ESP32 use Arduino IDE, PlatformIO, or ESP-IDF?
2. What reading interval do you want: every 10 seconds, 1 minute, 10 minutes, or another value?
3. How often should the ESP32 check the threshold from the web app?
4. Is the Django server always on the same Wi-Fi/LAN as the ESP32?
5. Should the ESP32 save unsent readings locally when Wi-Fi or the API is down?
6. Do you want one ESP32 only, or should the backend support multiple devices with device IDs?
7. Should the backend accept server-generated timestamps if the ESP32 cannot sync NTP?
8. Can you confirm the exact 4-pin fan connector pinout: 5V, GND, PWM, and tachometer order?
9. Should fan state be saved to the database and shown in the dashboard?
10. If PWM low does not fully stop the fan, should we add a MOSFET or relay for guaranteed shutdown?

## Recommended Next Step

After answering the open questions, implement the firmware as a first working version with:

- Arduino framework
- BMP280 I2C support
- NTP timestamps
- threshold fetch from the web app
- fan powered from the breadboard power supply module
- fan control through the fan PWM/control pin
- direct POST to `/api/v1/readings/`
- Serial Monitor diagnostics

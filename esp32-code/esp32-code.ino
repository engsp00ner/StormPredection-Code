#include <Arduino.h>
#include <ArduinoJson.h>
#include <Adafruit_BMP280.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

#if __has_include("config.h")
#include "config.h"
#else
#warning "config.h not found. Using placeholder values from the sketch."
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"
#define API_BASE_URL "http://192.168.1.10:8000"
#define SENSOR_API_KEY "MyStormPredectionKey"
#define BMP280_I2C_ADDRESS 0x76
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define FAN_CONTROL_PIN 25
#define FAN_CONTROL_INTERVAL_MS 3000UL
#define READING_POST_INTERVAL_MS 30000UL
#define THRESHOLD_REFRESH_INTERVAL_MS 60000UL
#define HEALTH_CHECK_INTERVAL_MS 20000UL
#define FALLBACK_FAN_THRESHOLD_C 30.0f
#define FAN_HYSTERESIS_C 0.5f
#define FAN_ACTIVE_HIGH 1
#endif

namespace {

Adafruit_BMP280 bmp;

float latestTemperatureC = NAN;
float latestPressureHPa = NAN;
float fanThresholdC = FALLBACK_FAN_THRESHOLD_C;
bool fanOn = false;
bool bmpReady = false;
bool serverReachable = false;

unsigned long lastFanControlMs = 0;
unsigned long lastReadingPostMs = 0;
unsigned long lastThresholdRefreshMs = 0;
unsigned long lastHealthCheckMs = 0;
unsigned long lastWifiAttemptMs = 0;

String apiUrl(const char *path) {
  String base = API_BASE_URL;
  if (base.endsWith("/")) {
    base.remove(base.length() - 1);
  }
  return base + path;
}

void setFan(bool enabled) {
  const bool changed = fanOn != enabled;
  fanOn = enabled;
  const int pinLevel = FAN_ACTIVE_HIGH ? (enabled ? HIGH : LOW) : (enabled ? LOW : HIGH);
  digitalWrite(FAN_CONTROL_PIN, pinLevel);
  if (!changed) return;
  Serial.print(">>> [FAN] state changed -> ");
  Serial.print(enabled ? "ON" : "OFF");
  Serial.print(" (pin ");
  Serial.print(pinLevel == HIGH ? "HIGH" : "LOW");
  Serial.println(")");
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  const unsigned long nowMs = millis();
  if (nowMs - lastWifiAttemptMs < 10000UL) {
    return;
  }
  lastWifiAttemptMs = nowMs;

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < 15000UL) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    Serial.println("========================================");
    Serial.print("  ESP32 IP address: ");
    Serial.println(WiFi.localIP());
    Serial.println("========================================");
  } else {
    Serial.println("Wi-Fi connection failed. Will retry.");
  }
}

void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Syncing NTP time");
  struct tm timeInfo;
  for (int attempt = 0; attempt < 20; attempt++) {
    if (getLocalTime(&timeInfo, 1000)) {
      Serial.println();
      Serial.println("NTP time synced.");
      return;
    }
    Serial.print(".");
  }
  Serial.println();
  Serial.println("NTP time not available yet.");
}

bool isoTimestampUtc(char *buffer, size_t size) {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 1000)) {
    return false;
  }
  strftime(buffer, size, "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return true;
}

void initBmp280() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  Serial.print("Looking for BMP280 at 0x");
  Serial.print(BMP280_I2C_ADDRESS, HEX);
  Serial.println("...");

  bmpReady = bmp.begin(BMP280_I2C_ADDRESS);
  if (!bmpReady) {
    Serial.print("BMP280 not found at 0x");
    Serial.println(BMP280_I2C_ADDRESS, HEX);

    const uint8_t fallback = (BMP280_I2C_ADDRESS == 0x76) ? 0x77 : 0x76;
    Serial.print("Trying 0x");
    Serial.print(fallback, HEX);
    Serial.println("...");
    bmpReady = bmp.begin(fallback);
  }

  if (!bmpReady) {
    Serial.println("BMP280 not found. Check wiring and I2C address.");
    return;
  }

  bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500);

  Serial.println("BMP280 found and initialized.");
}

bool readSensor() {
  if (!bmpReady) {
    return false;
  }

  latestTemperatureC = bmp.readTemperature();
  latestPressureHPa = bmp.readPressure() / 100.0f;

  if (isnan(latestTemperatureC) || isnan(latestPressureHPa)) {
    Serial.println("BMP280 returned invalid readings.");
    return false;
  }

  return true;
}

void updateFanControl() {
  if (isnan(latestTemperatureC)) {
    return;
  }

  if (!fanOn && latestTemperatureC >= fanThresholdC) {
    setFan(true);
  } else if (fanOn && latestTemperatureC < fanThresholdC - FAN_HYSTERESIS_C) {
    setFan(false);
  } else {
    setFan(fanOn);
  }

  Serial.print("Temp=");
  Serial.print(latestTemperatureC, 2);
  Serial.print(" C  Pressure=");
  Serial.print(latestPressureHPa, 2);
  Serial.print(" hPa  Threshold=");
  Serial.print(fanThresholdC, 2);
  Serial.print(" C  Fan=");
  Serial.print(fanOn ? "ON" : "OFF");
  Serial.print("  Pin=");
  Serial.println(digitalRead(FAN_CONTROL_PIN) == HIGH ? "HIGH" : "LOW");
}

bool refreshThreshold() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  const String url = apiUrl("/api/v1/settings/");
  http.begin(url);

  const int statusCode = http.GET();
  const String body = http.getString();
  http.end();

  if (statusCode != 200) {
    Serial.print("Settings fetch failed. HTTP ");
    Serial.println(statusCode);
    return false;
  }

  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, body);
  if (error) {
    Serial.print("Settings JSON parse failed: ");
    Serial.println(error.c_str());
    return false;
  }

  JsonArray settings = doc["settings"].as<JsonArray>();
  for (JsonObject setting : settings) {
    const char *key = setting["key"] | "";
    if (strcmp(key, "temperature_high_threshold") == 0) {
      const char *value = setting["value"] | "";
      const float parsed = atof(value);
      if (parsed > -60.0f && parsed < 100.0f) {
        fanThresholdC = parsed;
        Serial.print("Updated fan threshold from web app: ");
        Serial.print(fanThresholdC, 2);
        Serial.println(" C");
        return true;
      }
    }
  }

  Serial.println("temperature_high_threshold not found. Keeping previous threshold.");
  return false;
}

void checkServerHealth() {
  if (WiFi.status() != WL_CONNECTED) {
    serverReachable = false;
    Serial.println("Unable to access server (Wi-Fi not connected).");
    return;
  }

  HTTPClient http;
  http.begin(apiUrl("/api/v1/settings/"));
  http.setTimeout(5000);
  const int statusCode = http.GET();
  http.end();

  const bool wasReachable = serverReachable;
  serverReachable = (statusCode > 0);

  if (serverReachable && !wasReachable) {
    Serial.println("Server is back online. Resuming data upload.");
  } else if (!serverReachable) {
    Serial.print("Unable to access server. (HTTP error: ");
    Serial.print(statusCode);
    Serial.println(") Will retry in 20 seconds.");
  }
}

bool postReading() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping POST: Wi-Fi is not connected.");
    return false;
  }

  if (isnan(latestTemperatureC) || isnan(latestPressureHPa)) {
    Serial.println("Skipping POST: no valid sensor reading.");
    return false;
  }

  StaticJsonDocument<256> payload;

  char timestamp[25];
  if (isoTimestampUtc(timestamp, sizeof(timestamp))) {
    payload["timestamp"] = timestamp;
  } else {
    Serial.println("NTP not synced — server will timestamp this reading.");
  }

  payload["pressure_hPa"] = roundf(latestPressureHPa * 100.0f) / 100.0f;
  payload["temperature_C"] = roundf(latestTemperatureC * 100.0f) / 100.0f;
  payload["source"] = "sensor";

  String body;
  serializeJson(payload, body);

  HTTPClient http;
  const String url = apiUrl("/api/v1/readings/");
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", SENSOR_API_KEY);

  Serial.println("----------------------------------------");
  Serial.println("  >>> Sending reading to web server <<<");
  Serial.print("  URL     : "); Serial.println(url);
  Serial.print("  Payload : "); Serial.println(body);

  const int statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  if (statusCode == 201) {
    Serial.println("  [OK] Data accepted by server (HTTP 201)");
  } else {
    Serial.print("  [FAIL] Server replied HTTP ");
    Serial.println(statusCode);
    Serial.print("  Response: ");
    Serial.println(response);
  }
  Serial.println("----------------------------------------");

  return statusCode == 201;
}

}  // namespace

void setup() {
  // Drive the fan to its configured OFF level immediately.
  pinMode(FAN_CONTROL_PIN, OUTPUT);
  digitalWrite(FAN_CONTROL_PIN, FAN_ACTIVE_HIGH ? LOW : HIGH);

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 Storm Controller starting...");

  initBmp280();
  if (readSensor()) {
    updateFanControl();
  }

  connectWifi();
  if (WiFi.status() == WL_CONNECTED) {
    checkServerHealth();
    if (serverReachable) {
      if (refreshThreshold() && readSensor()) {
        updateFanControl();
      }
    }
    syncTime();
  }
}

void loop() {
  connectWifi();

  const unsigned long nowMs = millis();

  if (nowMs - lastHealthCheckMs >= HEALTH_CHECK_INTERVAL_MS) {
    lastHealthCheckMs = nowMs;
    checkServerHealth();
  }

  if (nowMs - lastFanControlMs >= FAN_CONTROL_INTERVAL_MS) {
    lastFanControlMs = nowMs;
    if (readSensor()) {
      updateFanControl();
    }
  }

  if (serverReachable && nowMs - lastThresholdRefreshMs >= THRESHOLD_REFRESH_INTERVAL_MS) {
    lastThresholdRefreshMs = nowMs;
    refreshThreshold();
  }

  if (serverReachable && nowMs - lastReadingPostMs >= READING_POST_INTERVAL_MS) {
    lastReadingPostMs = nowMs;
    postReading();
  }

  delay(50);
}

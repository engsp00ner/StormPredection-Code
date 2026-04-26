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
#define READING_POST_INTERVAL_MS 60000UL
#define THRESHOLD_REFRESH_INTERVAL_MS 60000UL
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

unsigned long lastFanControlMs = 0;
unsigned long lastReadingPostMs = 0;
unsigned long lastThresholdRefreshMs = 0;
unsigned long lastWifiAttemptMs = 0;

String apiUrl(const char *path) {
  String base = API_BASE_URL;
  if (base.endsWith("/")) {
    base.remove(base.length() - 1);
  }
  return base + path;
}

void setFan(bool enabled) {
  fanOn = enabled;

#if FAN_ACTIVE_HIGH
  digitalWrite(FAN_CONTROL_PIN, enabled ? HIGH : LOW);
#else
  digitalWrite(FAN_CONTROL_PIN, enabled ? LOW : HIGH);
#endif
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
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
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

  bmpReady = bmp.begin(BMP280_I2C_ADDRESS);
  if (!bmpReady && BMP280_I2C_ADDRESS != 0x77) {
    bmpReady = bmp.begin(0x77);
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

  Serial.println("BMP280 initialized.");
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
  } else if (fanOn && latestTemperatureC <= fanThresholdC - FAN_HYSTERESIS_C) {
    setFan(false);
  }

  Serial.print("Temperature=");
  Serial.print(latestTemperatureC, 2);
  Serial.print(" C Pressure=");
  Serial.print(latestPressureHPa, 2);
  Serial.print(" hPa Threshold=");
  Serial.print(fanThresholdC, 2);
  Serial.print(" C Fan=");
  Serial.println(fanOn ? "ON" : "OFF");
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

bool postReading() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping POST: Wi-Fi is not connected.");
    return false;
  }

  if (isnan(latestTemperatureC) || isnan(latestPressureHPa)) {
    Serial.println("Skipping POST: no valid sensor reading.");
    return false;
  }

  char timestamp[25];
  if (!isoTimestampUtc(timestamp, sizeof(timestamp))) {
    Serial.println("Skipping POST: NTP time is not available.");
    return false;
  }

  StaticJsonDocument<256> payload;
  payload["timestamp"] = timestamp;
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

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("Payload: ");
  Serial.println(body);

  const int statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.print("API HTTP ");
  Serial.println(statusCode);
  Serial.print("Response: ");
  Serial.println(response);

  return statusCode == 201;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 Storm Controller starting...");

  pinMode(FAN_CONTROL_PIN, OUTPUT);
  setFan(false);

  initBmp280();
  connectWifi();
  if (WiFi.status() == WL_CONNECTED) {
    syncTime();
    refreshThreshold();
  }
}

void loop() {
  connectWifi();

  const unsigned long nowMs = millis();

  if (nowMs - lastFanControlMs >= FAN_CONTROL_INTERVAL_MS) {
    lastFanControlMs = nowMs;
    if (readSensor()) {
      updateFanControl();
    }
  }

  if (nowMs - lastThresholdRefreshMs >= THRESHOLD_REFRESH_INTERVAL_MS) {
    lastThresholdRefreshMs = nowMs;
    refreshThreshold();
  }

  if (nowMs - lastReadingPostMs >= READING_POST_INTERVAL_MS) {
    lastReadingPostMs = nowMs;
    postReading();
  }

  delay(50);
}


#pragma once

// Copy this file to config.h and edit the values for your network and server.

#define WIFI_SSID "Kuwait"
#define WIFI_PASSWORD "Jassomq8i"

// Use the LAN IP address of the computer running Django. Do not use localhost.
#define API_BASE_URL "http://10.0.0.16:8000"
#define SENSOR_API_KEY "MyStormPredectionKey"

// BMP280 I2C address is commonly 0x76 or 0x77.
#define BMP280_I2C_ADDRESS 0x76

// ESP32 pins.
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define FAN_CONTROL_PIN 25

// Timing.
#define FAN_CONTROL_INTERVAL_MS 3000UL
#define READING_POST_INTERVAL_MS 30000UL
#define THRESHOLD_REFRESH_INTERVAL_MS 60000UL
#define HEALTH_CHECK_INTERVAL_MS 20000UL

// Used until the ESP32 successfully reads temperature_high_threshold
// from GET /api/v1/settings/.
#define FALLBACK_FAN_THRESHOLD_C 18.0f

// Fan turns on at threshold and turns off at threshold - hysteresis.
// Set to 0.0f if you want exact threshold behavior.
#define FAN_HYSTERESIS_C 0.5f

// For simple on/off control through the fan PWM/control pin.
#define FAN_ACTIVE_HIGH 1


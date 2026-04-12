# DATA_SCHEMA.md

## 📊 Training Data Format

```csv
timestamp,temperature_C,pressure_hPa,humidity_pct,label
2023-01-01 00:00:00,25.4,1008.2,61.0,0
```

---

## 📌 Required Fields

| Field         | Type     | Description |
| ------------- | -------- | ----------- |
| timestamp     | datetime | ISO format  |
| temperature_C | float    | Celsius     |
| pressure_hPa  | float    | hPa         |
| humidity_pct  | float    | optional    |
| label         | int      | 0 or 1      |

---

## ⚠️ Rules

- Data must be sorted by timestamp
- No duplicate timestamps
- Missing values:
  - allowed temporarily
  - must be handled in preprocessing

---

## 📡 Live Sensor Input

```json
{
  "timestamp": "2026-04-11T15:30:00",
  "pressure_hPa": 1004.8,
  "temperature_C": 28.4
}
```

---

## 📡 Future Input (BME280)

```json
{
  "timestamp": "2026-04-11T15:30:00",
  "pressure_hPa": 1004.8,
  "temperature_C": 28.4,
  "humidity_pct": 71.2
}
```

---

## ⏱️ Frequency

- Recommended: every 10–60 minutes
- Must be consistent

---

## ❗ Important

- Units must NOT change
- Column names must NOT change

# Storm Prediction System — Phase 1: Prediction Model

---

## 1. Project Overview

### Description

This project builds a machine learning-based storm prediction system using historical weather data. The system ingests pressure and temperature readings, engineers meaningful features, trains a classifier, and outputs a storm risk prediction.

### Scope

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Prediction model using historical data | **Current** |
| Phase 2 | ESP32 + BMP280 hardware integration, live inference | Planned |
| Phase 3 | BME280 upgrade (humidity), rain/wind sensors, streaming pipeline | Planned |

### Key Assumptions

- Input sensors in Phase 1: BMP280 (pressure + temperature only)
- Prediction horizon: storm occurrence within the next 3 hours
- "Storm" is defined as a significant pressure drop event correlated with severe weather labels in the dataset
- The model is trained offline on historical data and used for real-time inference in later phases
- Initial deployment is local (laptop/desktop), not cloud

---

## 2. Problem Definition

### Prediction Target

> **Will a storm occur within the next 3 hours?**

Binary classification:
- `1` = Storm expected within 3 hours
- `0` = No storm expected

### Classification vs. Regression

**Choice: Binary Classification**

| Approach | Justification |
|----------|--------------|
| Classification | Actionable output (yes/no alert) |
| Regression | Would predict storm intensity — unnecessary for Phase 1 |

### Justification Considering BMP280 Limitations

The BMP280 provides only **pressure** and **temperature**. These two signals are strongly correlated with storm development:

- Rapid pressure drop (>3–5 hPa in 3 hours) is a reliable storm precursor
- Temperature inversion patterns can indicate atmospheric instability

Classification is appropriate because:
1. The end goal is a binary alert system
2. Regression would require wind speed, precipitation, or radar data — unavailable from BMP280
3. Pressure-based binary models are proven in operational meteorology (barometric tendency rules)

---

## 3. Data Strategy

### Recommended Datasets

| Dataset | Source | Resolution | Features Available |
|---------|--------|------------|-------------------|
| NOAA ISD (Integrated Surface Database) | [NOAA](https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database) | Hourly | Pressure, temp, wind, weather codes |
| ERA5 Reanalysis | [Copernicus/ECMWF](https://cds.climate.copernicus.eu/) | Hourly, global | Full atmospheric variables |
| Open-Meteo Historical API | [open-meteo.com](https://open-meteo.com/) | Hourly | Pressure, temp, wind, precipitation |
| Kaggle Weather Datasets | Kaggle search: "weather storm dataset" | Varies | Varies |

**Recommended starting point:** Open-Meteo Historical API (free, no account needed, JSON output, easy to script).

### Required Features (Raw)

| Feature | Unit | Source |
|---------|------|--------|
| `pressure` | hPa | BMP280 / Dataset |
| `temperature` | °C | BMP280 / Dataset |
| `humidity` | % | Dataset (Phase 1) / BME280 (Phase 2) |
| `timestamp` | ISO 8601 | Sensor / Dataset |

### Label Definition

```
label = 1  if  any storm/severe weather event occurs within [t+1h, t+3h]
label = 0  otherwise
```

Storm events are identified from dataset weather codes (NOAA Present Weather codes, or precipitation > threshold in Open-Meteo).

### Fallback Strategy (Limited Labels)

If labeled storm events are sparse:
1. Define label via pressure drop rule: `label = 1 if pressure drops > 3 hPa in next 3 hours`
2. Use weak supervision — label from pressure tendency, validate against known storm records
3. Apply **class weighting** in training to handle imbalance (storms are rare events)
4. Use **SMOTE** or **oversampling** for the minority class if needed

---

## 4. Feature Engineering Design

### Raw Features

```
pressure_hPa         — current atmospheric pressure
temperature_C        — current air temperature
humidity_pct         — relative humidity (from dataset; BME280 in Phase 3)
hour_of_day          — integer 0–23
month                — integer 1–12
```

### Time-Based Lag Features

Capture recent history to model trends:

```
pressure_lag_1h      — pressure 1 hour ago
pressure_lag_2h      — pressure 2 hours ago
pressure_lag_3h      — pressure 3 hours ago
temp_lag_1h          — temperature 1 hour ago
temp_lag_2h          — temperature 2 hours ago
```

### Trend Features (Delta)

Critical for storm detection — pressure tendency is the primary meteorological signal:

```
pressure_diff_1h     = pressure - pressure_lag_1h
pressure_diff_3h     = pressure - pressure_lag_3h
temp_diff_1h         = temperature - temp_lag_1h
pressure_tendency    = (pressure_diff_3h / 3)   # rate per hour
```

### Rolling Statistics (Window-based)

Capture statistical context over recent windows:

```
pressure_rolling_mean_3h   — mean pressure over last 3 hours
pressure_rolling_std_3h    — std dev of pressure over last 3 hours
pressure_rolling_min_3h    — minimum pressure in last 3 hours
temp_rolling_mean_3h       — mean temperature over last 3 hours
```

### Why These Features Matter for Storms

| Feature | Meteorological Relevance |
|---------|--------------------------|
| `pressure_diff_3h` | Barometric tendency — most reliable single predictor of storm onset |
| `pressure_rolling_std_3h` | High variability indicates atmospheric instability |
| `temp_diff_1h` | Rapid cooling can precede convective storms |
| `hour_of_day`, `month` | Seasonal/diurnal patterns of storm frequency |
| `pressure_tendency` | Direct analog to official storm watch criteria (>3 hPa/3h) |

---

## 5. Model Selection

### Comparison

| Model | Pros | Cons | Suitable? |
|-------|------|------|-----------|
| Logistic Regression | Interpretable, fast, low data requirement | Linear decision boundary, misses complex patterns | Yes — baseline |
| Random Forest | Handles non-linearity, robust, feature importance | Slower inference, larger model | Yes — recommended |
| XGBoost / LightGBM | Best accuracy, handles imbalance via `scale_pos_weight` | More hyperparameters, less interpretable | Yes — Phase 1 primary |
| LSTM / Deep Learning | Excellent for sequences | Requires large data, harder to deploy on edge | No — overkill for Phase 1 |

### Recommended Model: **XGBoost**

### Justification

1. **Handles class imbalance** natively via `scale_pos_weight`
2. **Best performance** on tabular time-series features (empirically validated in meteorology literature)
3. **Fast inference** — suitable for future ESP32 → laptop pipeline
4. **Feature importance** built-in — helps validate that pressure features dominate
5. **Serializes compactly** — small `.json` or `.pkl` model file

### Why NOT Deep Learning (Phase 1)

- LSTM/Transformer models require large, clean sequential datasets (>100K samples minimum)
- Deployment complexity is unjustified when XGBoost matches or exceeds LSTM on small tabular datasets
- Interpretability matters — a meteorologist or developer needs to understand why a prediction was made
- Faster iteration in Phase 1 with classical ML

---

## 6. Training Pipeline

### Step-by-Step

```
1. Data Loading
2. Preprocessing (cleaning, type casting, sorting by time)
3. Feature Generation (lags, deltas, rolling stats)
4. Label Generation
5. Train/Validation Split (time-aware — NO random split)
6. Model Training
7. Evaluation
8. Model Saving
```

### Detailed Steps

**Step 1 — Data Loading**

```python
import pandas as pd

df = pd.read_csv("data/raw/weather_data.csv", parse_dates=["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)
```

**Step 2 — Preprocessing**

```python
df = df.dropna(subset=["pressure", "temperature"])
df["pressure"] = df["pressure"].clip(lower=900, upper=1100)   # physical bounds
df["temperature"] = df["temperature"].clip(lower=-60, upper=60)
```

**Step 3 — Feature Generation**

```python
from src.features import generate_features
df = generate_features(df)
```

**Step 4 — Label Generation**

```python
from src.labels import create_labels
df = create_labels(df, horizon_hours=3)
df = df.dropna(subset=["label"])  # drop rows without future data
```

**Step 5 — Time-Aware Split**

```python
split_date = "2023-01-01"
train = df[df["timestamp"] < split_date]
val   = df[df["timestamp"] >= split_date]

FEATURES = [c for c in df.columns if c not in ["timestamp", "label"]]
X_train, y_train = train[FEATURES], train["label"]
X_val,   y_val   = val[FEATURES],   val["label"]
```

**Step 6 — Training**

```python
import xgboost as xgb

ratio = (y_train == 0).sum() / (y_train == 1).sum()
model = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    scale_pos_weight=ratio,
    use_label_encoder=False,
    eval_metric="aucpr",
    random_state=42,
)
model.fit(X_train, y_train, eval_set=[(X_val, y_val)], early_stopping_rounds=30)
```

**Step 7 — Evaluation**

```python
from src.evaluate import evaluate_model
evaluate_model(model, X_val, y_val)
```

**Step 8 — Model Saving**

```python
import joblib
joblib.dump(model, "models/storm_model_v1.pkl")
```

---

## 7. Evaluation Metrics

### Metrics

| Metric | Formula | Why It Matters |
|--------|---------|----------------|
| Precision | TP / (TP + FP) | How many storm alerts were real? |
| Recall | TP / (TP + FN) | How many real storms did we catch? |
| F1-Score | 2 × (P × R) / (P + R) | Balance of precision and recall |
| ROC-AUC | Area under ROC curve | Overall discriminative ability |
| PR-AUC | Area under Precision-Recall curve | Best for imbalanced datasets |

### Priority Metric: **Recall** (then F1)

**Reason:** In storm prediction, a **false negative** (missing a storm) is far more dangerous than a **false positive** (unnecessary alert). The cost asymmetry demands high recall.

Target thresholds:
- Recall ≥ 0.80
- Precision ≥ 0.60
- F1 ≥ 0.68
- ROC-AUC ≥ 0.85

### Confusion Matrix Interpretation

```
                Predicted: No Storm    Predicted: Storm
Actual: No Storm     TN (good)           FP (alert fatigue)
Actual: Storm        FN (DANGER)         TP (goal)
```

---

## 8. System Architecture (Phase 1)

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1 ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────┐
  │  Raw Dataset  │  (NOAA / Open-Meteo CSV)
  │  CSV / API   │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ Preprocessing │  sort by time, clip outliers, fill gaps
  └──────┬───────┘
         │
         ▼
  ┌──────────────────┐
  │ Feature Engineering│  lags, deltas, rolling stats, time features
  └──────┬───────────┘
         │
         ▼
  ┌──────────────┐
  │ Label Creation│  storm in next 3h? → binary label
  └──────┬───────┘
         │
         ▼
  ┌──────────────────────────────┐
  │   Train / Validation Split   │  time-aware (no data leakage)
  └──────┬───────────────────────┘
         │
         ▼
  ┌──────────────┐
  │  XGBoost     │  train with class weights
  │  Classifier  │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  Evaluation  │  Recall, F1, ROC-AUC, PR-AUC
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ Model (*.pkl)│  saved for inference
  └──────┬───────┘
         │
         ▼
  ┌──────────────────┐
  │  Inference Script │  load model → predict on new input
  └──────────────────┘
```

---

## 9. Future Hardware Integration

### ESP32 Input Interface

The inference layer is designed to accept JSON from the ESP32 from day one:

```json
{
  "timestamp": "2025-06-15T14:30:00",
  "pressure_hPa": 1008.3,
  "temperature_C": 21.4
}
```

With BME280 upgrade (Phase 3):

```json
{
  "timestamp": "2025-06-15T14:30:00",
  "pressure_hPa": 1008.3,
  "temperature_C": 21.4,
  "humidity_pct": 78.2
}
```

### Live Data Buffering

```
ESP32 ──HTTP POST──► app/receiver.py
                          │
                     SQLite buffer
                     (rolling 3h window)
                          │
                     Feature engine
                          │
                     Model inference
                          │
                     Prediction output
```

- A **SQLite database** (or in-memory `deque`) stores the last N readings
- Minimum buffer: 3 hours of data (to compute all lag and rolling features)
- If buffer is not full, prediction is held until sufficient history is accumulated

### Real-Time Feature Computation

```python
from collections import deque
from src.features import compute_live_features

buffer = deque(maxlen=12)  # 12 readings × 15-min interval = 3 hours

def on_new_reading(reading: dict):
    buffer.append(reading)
    if len(buffer) < 4:
        return None  # insufficient history
    features = compute_live_features(list(buffer))
    prediction = model.predict_proba([features])[0][1]
    return prediction
```

### Upgrade Path to BME280

| Change | Impact |
|--------|--------|
| Add `humidity_pct` to JSON payload | Backward-compatible (field is optional) |
| Re-train model with humidity features | Incremental improvement expected |
| Retrain labels — humidity improves storm identification | Higher precision possible |
| No code restructuring needed | `generate_features()` checks column availability |

---

## 10. Project Structure

```
storm_prediction/
│
├── data/
│   ├── raw/                  # original downloaded datasets
│   ├── processed/            # cleaned, feature-engineered CSVs
│   └── external/             # third-party data (NOAA, ERA5)
│
├── models/
│   ├── storm_model_v1.pkl    # trained XGBoost model
│   └── model_metadata.json   # version, features used, thresholds
│
├── notebooks/
│   ├── 01_eda.ipynb          # exploratory data analysis
│   ├── 02_features.ipynb     # feature exploration
│   └── 03_training.ipynb     # model training experiments
│
├── src/
│   ├── __init__.py
│   ├── data_loader.py        # download and load raw datasets
│   ├── preprocessing.py      # cleaning, type casting
│   ├── features.py           # feature engineering functions
│   ├── labels.py             # label generation logic
│   ├── train.py              # training pipeline entry point
│   ├── evaluate.py           # evaluation metrics and reporting
│   └── predict.py            # inference function
│
├── app/
│   ├── receiver.py           # HTTP server for ESP32 JSON input
│   ├── buffer.py             # rolling data buffer (SQLite / deque)
│   └── api.py                # REST API for predictions (Phase 2+)
│
├── tests/
│   ├── test_features.py
│   ├── test_labels.py
│   └── test_predict.py
│
├── requirements.txt
├── config.yaml               # model params, paths, thresholds
└── README.md
```

### Directory Descriptions

| Directory | Purpose |
|-----------|---------|
| `data/` | All data — raw inputs, processed outputs, external sources |
| `models/` | Serialized trained models + metadata |
| `notebooks/` | Exploration, prototyping, visualization |
| `src/` | Production-quality Python modules |
| `app/` | Web-facing layer for real-time ESP32 integration |
| `tests/` | Unit tests for all core functions |

---

## 11. Implementation Plan (Step-by-Step)

### Step 1 — Obtain Dataset

```bash
# Option A: Open-Meteo (free, no API key)
python src/data_loader.py --source open-meteo --lat 48.8 --lon 2.3 --start 2020-01-01 --end 2024-01-01

# Option B: Download NOAA ISD station CSV manually
# https://www.ncei.noaa.gov/data/global-hourly/
```

**Output:** `data/raw/weather_raw.csv`

---

### Step 2 — Preprocessing

```bash
python src/preprocessing.py --input data/raw/weather_raw.csv --output data/processed/weather_clean.csv
```

Tasks:
- Parse timestamps
- Sort chronologically
- Remove duplicates
- Clip physical outliers
- Forward-fill short gaps (≤2h)

**Output:** `data/processed/weather_clean.csv`

---

### Step 3 — Feature Engineering

```bash
python src/features.py --input data/processed/weather_clean.csv --output data/processed/weather_features.csv
```

Tasks:
- Compute lags (1h, 2h, 3h)
- Compute deltas (1h, 3h)
- Compute rolling statistics (mean, std, min — 3h window)
- Add hour of day, month

**Output:** `data/processed/weather_features.csv`

---

### Step 4 — Label Generation

```bash
python src/labels.py --input data/processed/weather_features.csv --output data/processed/weather_labeled.csv --horizon 3
```

Tasks:
- Look ahead 3 hours for storm event
- Label based on weather code or pressure drop threshold
- Report class distribution

**Output:** `data/processed/weather_labeled.csv`

---

### Step 5 — Model Training

```bash
python src/train.py --data data/processed/weather_labeled.csv --output models/storm_model_v1.pkl
```

Tasks:
- Time-aware train/val split
- XGBoost training with early stopping
- Log metrics to console

**Output:** `models/storm_model_v1.pkl`

---

### Step 6 — Evaluation

```bash
python src/evaluate.py --model models/storm_model_v1.pkl --data data/processed/weather_labeled.csv
```

Output:
- Classification report (precision, recall, F1)
- ROC-AUC and PR-AUC scores
- Confusion matrix
- Feature importance plot

---

### Step 7 — Inference Script

```bash
python src/predict.py --model models/storm_model_v1.pkl --input sample_input.json
```

Accepts a JSON file or stdin with recent readings, outputs:

```json
{
  "storm_probability": 0.83,
  "prediction": 1,
  "risk_level": "HIGH"
}
```

---

## 12. Sample Data Format

### CSV Format

```csv
timestamp,temperature_C,pressure_hPa,humidity_pct,label
2023-01-01 00:00:00,8.2,1013.4,72.1,0
2023-01-01 01:00:00,7.8,1012.1,74.3,0
2023-01-01 02:00:00,7.1,1009.8,79.0,0
2023-01-01 03:00:00,6.5,1006.2,83.5,1
2023-01-01 04:00:00,5.9,1002.1,88.2,1
2023-01-01 05:00:00,5.4,999.3,91.0,1
```

### Feature-Engineered CSV (after Step 3)

```csv
timestamp,temperature_C,pressure_hPa,humidity_pct,pressure_lag_1h,pressure_lag_3h,pressure_diff_1h,pressure_diff_3h,pressure_tendency,pressure_rolling_mean_3h,pressure_rolling_std_3h,hour_of_day,month,label
2023-01-01 03:00:00,6.5,1006.2,83.5,1009.8,1013.4,-3.6,-7.2,-2.4,1009.8,2.93,3,1,1
```

### ESP32 Live Input (JSON)

```json
{
  "timestamp": "2025-06-15T14:30:00",
  "pressure_hPa": 1006.2,
  "temperature_C": 18.7
}
```

---

## 13. Risks and Limitations

### BMP280 Sensor Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No humidity measurement | Reduces model accuracy | Use dataset humidity in Phase 1; BME280 in Phase 3 |
| ±1 hPa accuracy | May miss small pressure changes | Calibrate against reference; use rolling averages to smooth |
| No wind/rain measurement | Major predictors missing | Add sensors in Phase 3 roadmap |
| Indoor placement affects readings | Pressure readings biased | Place sensor outdoors or in ventilated location |

### Data Limitations

| Risk | Detail | Mitigation |
|------|--------|------------|
| Label scarcity | Storms are rare (~1–5% of hours) | Class weighting, SMOTE, PR-AUC priority |
| Local vs. regional prediction | Model trained on station data, not local microclimate | Start with nearest weather station; refine with local sensor data |
| Temporal distribution shift | Weather patterns shift over years/decades | Retrain annually; monitor model drift |
| Missing historical humidity | Phase 1 dataset may lack humidity column | Fill with ERA5 reanalysis or train without it initially |

### Model Limitations

- Model predicts based on pressure/temperature only — **no radar, no satellite, no wind data**
- Storm types vary: frontal storms (pressure-driven) vs. convective storms (temperature-driven) — model may underperform on convective events
- Prediction horizon fixed at 3 hours — may need adjustment based on local storm characteristics

---

## 14. Version 2 Roadmap

### Hardware Upgrades

| Upgrade | Benefit | Priority |
|---------|---------|----------|
| BMP280 → BME280 | Adds humidity — improves convective storm detection | High |
| Rain sensor (tipping bucket) | Direct precipitation measurement | Medium |
| Anemometer (wind speed/direction) | Major predictor for storm intensity | Medium |
| UV/light sensor | Convective storm precursor | Low |

### Software Upgrades

| Feature | Description | Priority |
|---------|-------------|----------|
| MQTT streaming | Real-time data from ESP32 to server | High |
| Weather API enrichment | Supplement local sensor data with NWP model output | Medium |
| Multi-horizon prediction | Predict at 1h, 3h, 6h | Medium |
| Alert system | Push notification / email when storm probability > threshold | High |
| Model retraining pipeline | Automated retraining on new local data | Medium |
| Dashboard | Real-time visualization (pressure trend, prediction gauge) | Low |

### Phase 3 Architecture Target

```
ESP32 + BME280 + Rain Sensor + Wind Sensor
          │
          ▼ MQTT
     MQTT Broker (Mosquitto)
          │
          ▼
     Python Subscriber
          │
       SQLite Buffer
          │
     Feature Engine (real-time)
          │
     XGBoost / Retrained Model
          │
     Alert + Dashboard
```

---

## 15. Starter Code Snippets

### Feature Engineering (`src/features.py`)

```python
import pandas as pd

def generate_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate lag, delta, rolling, and time features from raw weather data.
    Input columns required: timestamp, pressure_hPa, temperature_C
    """
    df = df.sort_values("timestamp").copy()

    # Lag features
    for lag in [1, 2, 3]:
        df[f"pressure_lag_{lag}h"] = df["pressure_hPa"].shift(lag)
        df[f"temp_lag_{lag}h"]     = df["temperature_C"].shift(lag)

    # Delta (trend) features
    df["pressure_diff_1h"]  = df["pressure_hPa"] - df["pressure_lag_1h"]
    df["pressure_diff_3h"]  = df["pressure_hPa"] - df["pressure_lag_3h"]
    df["temp_diff_1h"]      = df["temperature_C"] - df["temp_lag_1h"]
    df["pressure_tendency"] = df["pressure_diff_3h"] / 3  # hPa per hour

    # Rolling statistics (3-hour window)
    df["pressure_rolling_mean_3h"] = df["pressure_hPa"].rolling(3).mean()
    df["pressure_rolling_std_3h"]  = df["pressure_hPa"].rolling(3).std()
    df["pressure_rolling_min_3h"]  = df["pressure_hPa"].rolling(3).min()
    df["temp_rolling_mean_3h"]     = df["temperature_C"].rolling(3).mean()

    # Time features
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["month"]       = df["timestamp"].dt.month

    return df
```

---

### Label Creation (`src/labels.py`)

```python
import pandas as pd

def create_labels(
    df: pd.DataFrame,
    horizon_hours: int = 3,
    pressure_drop_threshold: float = 3.0,
    use_weather_code: bool = False,
    weather_code_col: str = "weather_code",
    storm_codes: list = None,
) -> pd.DataFrame:
    """
    Create binary storm label: 1 if storm in next `horizon_hours` hours.

    Primary method: pressure drop rule.
    Fallback: weather code column if available.
    """
    df = df.copy().sort_values("timestamp").reset_index(drop=True)

    if use_weather_code and weather_code_col in df.columns:
        storm_codes = storm_codes or [95, 96, 99]  # NOAA thunderstorm codes
        df["is_storm"] = df[weather_code_col].isin(storm_codes).astype(int)
    else:
        # Pressure drop rule: label=1 if pressure drops > threshold in next horizon hours
        future_pressure = df["pressure_hPa"].shift(-horizon_hours)
        pressure_drop   = df["pressure_hPa"] - future_pressure
        df["is_storm"]  = (pressure_drop > pressure_drop_threshold).astype(int)

    # Label at time t = storm occurs in [t+1, t+horizon]
    df["label"] = df["is_storm"].rolling(window=horizon_hours, min_periods=1).max().shift(-horizon_hours)
    df["label"] = df["label"].astype("Int64")

    return df
```

---

### Model Training (`src/train.py`)

```python
import pandas as pd
import xgboost as xgb
import joblib
import yaml
from pathlib import Path
from sklearn.metrics import classification_report, roc_auc_score

FEATURE_COLS = [
    "pressure_hPa", "temperature_C",
    "pressure_lag_1h", "pressure_lag_2h", "pressure_lag_3h",
    "temp_lag_1h", "temp_lag_2h",
    "pressure_diff_1h", "pressure_diff_3h",
    "pressure_tendency",
    "pressure_rolling_mean_3h", "pressure_rolling_std_3h", "pressure_rolling_min_3h",
    "temp_rolling_mean_3h",
    "hour_of_day", "month",
]

def train(data_path: str, model_output: str, split_date: str = "2023-01-01"):
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    df = df.dropna(subset=FEATURE_COLS + ["label"])

    train_df = df[df["timestamp"] <  split_date]
    val_df   = df[df["timestamp"] >= split_date]

    X_train, y_train = train_df[FEATURE_COLS], train_df["label"].astype(int)
    X_val,   y_val   = val_df[FEATURE_COLS],   val_df["label"].astype(int)

    ratio = (y_train == 0).sum() / max((y_train == 1).sum(), 1)

    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=ratio,
        eval_metric="aucpr",
        early_stopping_rounds=30,
        random_state=42,
        verbosity=1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=50,
    )

    y_pred  = model.predict(X_val)
    y_proba = model.predict_proba(X_val)[:, 1]

    print(classification_report(y_val, y_pred, target_names=["No Storm", "Storm"]))
    print(f"ROC-AUC: {roc_auc_score(y_val, y_proba):.4f}")

    joblib.dump(model, model_output)
    print(f"Model saved to {model_output}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",   required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--split",  default="2023-01-01")
    args = parser.parse_args()
    train(args.data, args.output, args.split)
```

---

### Prediction Function (`src/predict.py`)

```python
import json
import joblib
import pandas as pd
from collections import deque
from src.features import generate_features

FEATURE_COLS = [
    "pressure_hPa", "temperature_C",
    "pressure_lag_1h", "pressure_lag_2h", "pressure_lag_3h",
    "temp_lag_1h", "temp_lag_2h",
    "pressure_diff_1h", "pressure_diff_3h",
    "pressure_tendency",
    "pressure_rolling_mean_3h", "pressure_rolling_std_3h", "pressure_rolling_min_3h",
    "temp_rolling_mean_3h",
    "hour_of_day", "month",
]

RISK_THRESHOLDS = {0.3: "LOW", 0.6: "MEDIUM", 0.8: "HIGH"}


def classify_risk(prob: float) -> str:
    for threshold in sorted(RISK_THRESHOLDS.keys(), reverse=True):
        if prob >= threshold:
            return RISK_THRESHOLDS[threshold]
    return "LOW"


class StormPredictor:
    def __init__(self, model_path: str, buffer_size: int = 12):
        self.model  = joblib.load(model_path)
        self.buffer = deque(maxlen=buffer_size)

    def add_reading(self, reading: dict) -> dict | None:
        """
        Add a new sensor reading. Returns prediction when buffer has enough history.
        reading: {"timestamp": str, "pressure_hPa": float, "temperature_C": float}
        """
        self.buffer.append(reading)

        if len(self.buffer) < 4:
            return {"status": "buffering", "readings": len(self.buffer)}

        df = pd.DataFrame(list(self.buffer))
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = generate_features(df).dropna(subset=FEATURE_COLS)

        if df.empty:
            return {"status": "insufficient_features"}

        latest  = df.iloc[[-1]][FEATURE_COLS]
        prob    = float(self.model.predict_proba(latest)[0][1])
        label   = int(prob >= 0.5)
        risk    = classify_risk(prob)

        return {
            "storm_probability": round(prob, 4),
            "prediction": label,
            "risk_level": risk,
        }


if __name__ == "__main__":
    import argparse, sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", default="-")
    args = parser.parse_args()

    predictor = StormPredictor(args.model)

    data = json.load(open(args.input) if args.input != "-" else sys.stdin)
    readings = data if isinstance(data, list) else [data]

    result = None
    for r in readings:
        result = predictor.add_reading(r)

    print(json.dumps(result, indent=2))
```

---

### Requirements (`requirements.txt`)

```
xgboost>=2.0.0
scikit-learn>=1.3.0
pandas>=2.0.0
numpy>=1.24.0
joblib>=1.3.0
pyyaml>=6.0
requests>=2.31.0
flask>=3.0.0
imbalanced-learn>=0.11.0
matplotlib>=3.7.0
seaborn>=0.12.0
```

---

*Document version: 1.0.0 — Phase 1 complete specification*
*Last updated: 2026-04-11*
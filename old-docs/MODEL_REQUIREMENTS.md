# MODEL_REQUIREMENTS.md

## 🎯 Task Definition

Binary classification problem:

Predict whether a storm will occur within the next 3 hours.

- Output:
  - 1 → Storm expected
  - 0 → No storm

---

## 🧠 Model Selection

### Allowed Models (Phase 1)

- Random Forest
- XGBoost (Preferred)

### Not Allowed

- Deep Learning (LSTM, Transformers)
- Neural Networks

---

## 📊 Input Features

Model must use features generated from:

- pressure_hPa
- temperature_C

And engineered features:

- pressure_lag_1h
- pressure_lag_2h
- pressure_lag_3h
- temp_lag_1h
- temp_lag_2h
- pressure_diff_1h
- pressure_diff_3h
- pressure_tendency
- pressure_rolling_mean_3h
- pressure_rolling_std_3h
- pressure_rolling_min_3h
- temp_rolling_mean_3h
- hour_of_day
- month

⚠️ Feature names must match exactly

---

## ⚖️ Class Imbalance Handling

Storms are rare events.

The model MUST handle imbalance using:

- class weights OR
- scale_pos_weight (for XGBoost)

---

## 📈 Evaluation Metrics

### Priority:

1. Recall (most important)
2. F1-score
3. ROC-AUC

### Why Recall?

Missing a storm is worse than false alarm.

---

## 💾 Model Saving

Model must be saved using:

```python
joblib.dump(model, "models/storm_model.pkl")
```

---

## 🔮 Prediction Output Format

```json
{
  "storm_probability": 0.82,
  "prediction": 1,
  "risk_level": "HIGH"
}
```

---

## 🔌 Inference Input Format

Model must accept input like:

```json
{
  "timestamp": "2026-04-11T15:30:00",
  "pressure_hPa": 1004.8,
  "temperature_C": 28.4
}
```

---

## ⚙️ Constraints

- No random train/test split
- Must use time-based split
- Must avoid data leakage
- Must support future ESP32 integration
- Must work with missing humidity (optional field)

---

## 🧩 Compatibility Requirement

The model must be designed so that:

- It can later receive real-time sensor data
- It can compute features dynamically
- It can work with rolling buffer input

---

## ✅ Definition of Done

Model is considered complete when:

- Trains successfully
- Saves `.pkl` file
- Produces predictions
- Uses correct features
- Meets evaluation requirements

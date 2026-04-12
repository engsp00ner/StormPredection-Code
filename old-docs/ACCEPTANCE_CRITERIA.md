# ACCEPTANCE_CRITERIA.md

## ✅ Data Loader

- Loads CSV correctly
- Parses timestamp
- Sorts data

---

## ✅ Preprocessing

- Removes invalid values
- Handles missing values

---

## ✅ Features

- Creates lag features
- Creates delta features
- Creates rolling stats

---

## ✅ Labels

- Generates correct binary labels
- No future leakage

---

## ✅ Training

- Model trains successfully
- Model saved as `.pkl`

---

## ✅ Evaluation

- Outputs:
  - precision
  - recall
  - F1
  - ROC-AUC

---

## ✅ Prediction

- Accepts JSON input
- Returns prediction result

---

## ✅ System

- Runs end-to-end without crash

---

## ❌ Failure Conditions

- Crashes on missing data
- Uses random split
- Missing features
- No model saved

# TASK_BREAKDOWN.md

## 🎯 Phase 1 Tasks

---

## Task 1 — Project Setup

**Goal:** Create project structure

- Create folders:
  - data/
  - src/
  - models/
  - app/

- Create empty files

✅ Done when:

- structure matches FILE_TREE.md

---

## Task 2 — Requirements

**Goal:** Define dependencies

- Create `requirements.txt`
- Include:
  - pandas
  - scikit-learn
  - xgboost
  - joblib

✅ Done when:

- project installs without errors

---

## Task 3 — Data Loader

**Goal:** Load dataset

- Read CSV
- Parse timestamp
- Sort data

Files:

- src/data_loader.py

✅ Done when:

- returns clean DataFrame

---

## Task 4 — Preprocessing

**Goal:** Clean data

- Remove invalid values
- Clip outliers
- Handle missing values

Files:

- src/preprocessing.py

---

## Task 5 — Feature Engineering

**Goal:** Generate features

- lag features
- delta features
- rolling stats

Files:

- src/features.py

---

## Task 6 — Label Creation

**Goal:** Create storm labels

- use pressure drop rule

Files:

- src/labels.py

---

## Task 7 — Model Training

**Goal:** Train baseline model

- time-based split
- train model
- save model

Files:

- src/train.py

---

## Task 8 — Evaluation

**Goal:** Evaluate model

- precision
- recall
- F1
- ROC-AUC

Files:

- src/evaluate.py

---

## Task 9 — Prediction

**Goal:** Build inference

- load model
- predict from input

Files:

- src/predict.py

---

## Task 10 — Live Input Preparation

**Goal:** Prepare for ESP32

- accept JSON input
- buffer readings

Files:

- app/local_infer.py

---

## 🧩 Execution Rule

⚠️ IMPORTANT:

- Execute tasks **in order**
- Do NOT skip tasks
- Do NOT jump ahead

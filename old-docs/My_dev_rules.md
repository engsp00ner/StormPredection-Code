# MY_DEV_RULES.md

## 🎯 Goal

Ensure consistent, clean, and scalable code for the storm prediction system.

---

## 🧱 General Rules

- Use **Python 3.11+**
- Follow **modular architecture**
- Each file has **one responsibility only**
- Avoid overengineering — keep it simple
- Code must be **readable before being clever**
- Always assume future **ESP32 live integration**

---

## 📦 Project Structure Rules

- Follow the defined `FILE_TREE.md` exactly
- Do NOT create random folders
- Keep:
  - `src/` → core logic
  - `app/` → runtime/inference
  - `data/` → datasets
  - `models/` → saved models

---

## 🧠 Machine Learning Rules

- Start with:
  - Random Forest OR XGBoost

- Do NOT use deep learning in Phase 1
- Always:
  - Handle class imbalance
  - Use time-based split (NO random split)

- Save model using:

  ```python
  joblib.dump(model, path)
  ```

---

## 📊 Data Handling Rules

- All timestamps must be:
  - parsed
  - sorted

- Never mix past and future (NO data leakage)
- Handle missing values:
  - drop OR forward-fill (short gaps only)

---

## ⚙️ Feature Engineering Rules

- Must include:
  - lag features
  - delta features
  - rolling statistics

- Feature names must be consistent:
  - `pressure_hPa`
  - `temperature_C`

---

## 🧪 Code Quality Rules

- Use:
  - type hints
  - clear function names

- Avoid:
  - long functions (>50 lines)

- Add minimal but useful comments

---

## 🔌 Future Integration Rules

- All prediction functions must accept:

```json
{
  "timestamp": "...",
  "pressure_hPa": ...,
  "temperature_C": ...
}
```

- Must support missing humidity (optional field)

---

## 🚫 Forbidden

- No hardcoded paths
- No mixing training and inference
- No random data splits
- No unused code

---

## ✅ Definition of Good Code

- Runs without errors
- Modular
- Reusable
- Easy to extend for ESP32

## 🐍 Python Environment Rules

- Any Python project MUST create and use a dedicated virtual environment (`venv`)
- Do NOT install packages globally
- All required packages must be installed inside the project virtual environment only
- The same virtual environment must be used for:
  - development
  - debugging
  - runtime
  - testing

### Required Setup

For every Python project:

```bash
python -m venv .venv
```

Activate it before any install or run:

### Windows PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
```

### Windows CMD

```cmd
.venv\Scripts\activate.bat
```

### Linux / macOS

```bash
source .venv/bin/activate
```

Then install dependencies only inside the venv:

```bash
pip install -r requirements.txt
```

### Dependency Rules

- Always create `requirements.txt`
- Any newly used package must be added to `requirements.txt`
- Prefer pinned or controlled versions when stability matters
- Do NOT use packages that are not declared in `requirements.txt`

### Runtime Rules

- All run commands must assume `.venv` is the active environment
- All debug configurations must point to the Python interpreter inside `.venv`
- Never run project scripts with a global Python interpreter

### Debugging Rules

In VS Code, the selected interpreter must be:

```text
<project-folder>/.venv/Scripts/python.exe
```

on Windows, or:

```text
<project-folder>/.venv/bin/python
```

on Linux/macOS.

- Debugging must use the same interpreter as runtime
- Tests must also run inside the same `.venv`

### Project Standard

Every Python project should include:

```text
.venv/
requirements.txt
.vscode/settings.json
```

### VS Code Rule

If needed, create `.vscode/settings.json` to bind the project to the local venv interpreter.

Example:

```json
{
  "python.defaultInterpreterPath": ".venv/Scripts/python.exe"
}
```

### Forbidden

- No global pip install
- No using system Python for debug while runtime uses venv
- No missing `requirements.txt`
- No multiple conflicting virtual environments inside the same project unless explicitly required
  Any required package MUST be added to requirements.txt
  Do not assume packages exist

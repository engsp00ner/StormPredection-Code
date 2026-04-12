# Storm Prediction Phase 1

Phase 1 implements an offline storm prediction pipeline that:

- loads or generates timestamped pressure/temperature weather data
- preprocesses and engineers the required lag, delta, and rolling features
- creates a 3-hour storm label using a pressure-drop rule
- trains an XGBoost classifier with time-aware validation
- serves rolling-buffer JSON inference for future ESP32 integration

## Quick Start

```powershell
.\Storm-venv\Scripts\python.exe src\data_loader.py --source synthetic --output data\raw\weather_raw.csv
.\Storm-venv\Scripts\python.exe src\preprocessing.py --input data\raw\weather_raw.csv --output data\processed\weather_clean.csv
.\Storm-venv\Scripts\python.exe src\features.py --input data\processed\weather_clean.csv --output data\processed\weather_features.csv
.\Storm-venv\Scripts\python.exe src\labels.py --input data\processed\weather_features.csv --output data\processed\weather_labeled.csv --horizon 3
.\Storm-venv\Scripts\python.exe src\train.py --data data\processed\weather_labeled.csv --output models\storm_model.pkl
.\Storm-venv\Scripts\python.exe src\evaluate.py --model models\storm_model.pkl --data data\processed\weather_labeled.csv --metadata models\model_metadata.json
```

To tune hyperparameters on the labeled CSV:

```powershell
.\Storm-venv\Scripts\python.exe src\tune.py --data data\processed\weather_labeled.csv --output models\storm_model.pkl
```

## Local Inference

Create a JSON file containing one reading or a recent list of readings:

```json
[
  {"timestamp": "2026-04-11T12:00:00", "pressure_hPa": 1012.4, "temperature_C": 24.1},
  {"timestamp": "2026-04-11T13:00:00", "pressure_hPa": 1011.7, "temperature_C": 23.9},
  {"timestamp": "2026-04-11T14:00:00", "pressure_hPa": 1010.2, "temperature_C": 23.1},
  {"timestamp": "2026-04-11T15:00:00", "pressure_hPa": 1008.6, "temperature_C": 22.4}
]
```

Then run:

```powershell
.\Storm-venv\Scripts\python.exe app\local_infer.py --model models\storm_model.pkl --input sample_input.json
```

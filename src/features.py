from __future__ import annotations

import argparse
from pathlib import Path
import sys

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import FEATURE_COLS, REQUIRED_COLUMNS


def generate_features(df: pd.DataFrame) -> pd.DataFrame:
    """Generate the exact Phase 1 model features from timestamped sensor readings."""
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    featured = df.copy()
    featured["timestamp"] = pd.to_datetime(featured["timestamp"], errors="coerce")
    featured = featured.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

    for lag in [1, 2, 3]:
        featured[f"pressure_lag_{lag}h"] = featured["pressure_hPa"].shift(lag)
        featured[f"temp_lag_{lag}h"] = featured["temperature_C"].shift(lag)

    featured["pressure_diff_1h"] = featured["pressure_hPa"] - featured["pressure_lag_1h"]
    featured["pressure_diff_3h"] = featured["pressure_hPa"] - featured["pressure_lag_3h"]
    featured["temp_diff_1h"] = featured["temperature_C"] - featured["temp_lag_1h"]
    featured["pressure_tendency"] = featured["pressure_diff_3h"] / 3.0

    rolling_pressure = featured["pressure_hPa"].rolling(window=3, min_periods=3)
    rolling_temp = featured["temperature_C"].rolling(window=3, min_periods=3)

    featured["pressure_rolling_mean_3h"] = rolling_pressure.mean()
    featured["pressure_rolling_std_3h"] = rolling_pressure.std()
    featured["pressure_rolling_min_3h"] = rolling_pressure.min()
    featured["temp_rolling_mean_3h"] = rolling_temp.mean()

    featured["hour_of_day"] = featured["timestamp"].dt.hour
    featured["month"] = featured["timestamp"].dt.month

    missing_features = [column for column in FEATURE_COLS if column not in featured.columns]
    if missing_features:
        raise RuntimeError(f"Failed to generate required features: {missing_features}")

    return featured


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate storm prediction features.")
    parser.add_argument("--input", required=True, help="Path to cleaned weather CSV.")
    parser.add_argument("--output", required=True, help="Path to feature CSV.")
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    featured = generate_features(df)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    featured.to_csv(output_path, index=False)
    print(f"Saved {len(featured)} feature rows to {output_path}")


if __name__ == "__main__":
    main()

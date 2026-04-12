from __future__ import annotations

import argparse
from pathlib import Path
import sys

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import REQUIRED_COLUMNS


def preprocess_data(df: pd.DataFrame, expected_freq: str = "h", ffill_limit: int = 2) -> pd.DataFrame:
    """Clean raw weather data without leaking future information."""
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    cleaned = df.copy()
    cleaned["timestamp"] = pd.to_datetime(cleaned["timestamp"], errors="coerce")
    cleaned = cleaned.dropna(subset=["timestamp"]).sort_values("timestamp")
    cleaned = cleaned.drop_duplicates(subset=["timestamp"], keep="last")

    numeric_columns = [column for column in cleaned.columns if column != "timestamp"]
    for column in numeric_columns:
        cleaned[column] = pd.to_numeric(cleaned[column], errors="coerce")

    cleaned["pressure_hPa"] = cleaned["pressure_hPa"].clip(lower=900, upper=1100)
    cleaned["temperature_C"] = cleaned["temperature_C"].clip(lower=-60, upper=60)
    if "humidity_pct" in cleaned.columns:
        cleaned["humidity_pct"] = cleaned["humidity_pct"].clip(lower=0, upper=100)

    cleaned = cleaned.set_index("timestamp").asfreq(expected_freq)
    cleaned[numeric_columns] = cleaned[numeric_columns].ffill(limit=ffill_limit)
    cleaned = cleaned.dropna(subset=["pressure_hPa", "temperature_C"]).reset_index()
    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean raw weather data.")
    parser.add_argument("--input", required=True, help="Path to raw weather CSV.")
    parser.add_argument("--output", required=True, help="Path to cleaned CSV.")
    parser.add_argument("--freq", default="h", help="Expected measurement frequency.")
    parser.add_argument("--ffill-limit", type=int, default=2, help="Maximum short gap to forward fill.")
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    cleaned = preprocess_data(df, expected_freq=args.freq, ffill_limit=args.ffill_limit)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.to_csv(output_path, index=False)
    print(f"Saved {len(cleaned)} cleaned rows to {output_path}")


if __name__ == "__main__":
    main()

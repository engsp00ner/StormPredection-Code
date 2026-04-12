from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import REQUIRED_COLUMNS


def load_data(filepath: str | Path) -> pd.DataFrame:
    """Load a weather CSV, parse timestamps, and sort chronologically."""
    df = pd.read_csv(filepath)
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    return df


def generate_synthetic_weather_data(
    start: str = "2022-01-01",
    periods: int = 24 * 365,
    freq: str = "h",
    seed: int = 42,
) -> pd.DataFrame:
    """Create a realistic demo dataset so the full pipeline is runnable locally."""
    rng = np.random.default_rng(seed)
    timestamps = pd.date_range(start=start, periods=periods, freq=freq)
    hours = np.arange(periods)

    seasonal = 8 * np.sin(2 * np.pi * hours / (24 * 365))
    daily = 4 * np.sin(2 * np.pi * hours / 24)
    noise = rng.normal(0, 1.2, periods)
    temperature = 18 + seasonal + daily + noise

    pressure = np.full(periods, 1015.0)
    pressure += 2.5 * np.sin(2 * np.pi * hours / (24 * 14))
    pressure += rng.normal(0, 0.6, periods)

    humidity = 65 + 12 * np.sin(2 * np.pi * hours / 24 + 1.3) + rng.normal(0, 4, periods)

    storm_starts = rng.choice(np.arange(12, periods - 6, 48), size=max(periods // 240, 10), replace=False)
    for start_idx in storm_starts:
        drop_profile = np.array([0.0, -1.2, -2.8, -4.6, -3.7, -2.0])
        pressure[start_idx : start_idx + len(drop_profile)] += drop_profile
        temperature[start_idx : start_idx + len(drop_profile)] -= np.array([0.0, 0.4, 1.0, 1.8, 1.2, 0.5])
        humidity[start_idx : start_idx + len(drop_profile)] += np.array([0.0, 3.0, 6.0, 10.0, 7.0, 4.0])

    df = pd.DataFrame(
        {
            "timestamp": timestamps,
            "temperature_C": temperature.round(2),
            "pressure_hPa": pressure.round(2),
            "humidity_pct": np.clip(humidity, 20, 100).round(2),
        }
    )
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Load or generate raw weather data.")
    parser.add_argument("--input", help="Path to an existing raw weather CSV.")
    parser.add_argument("--output", required=True, help="Path to write the normalized raw CSV.")
    parser.add_argument(
        "--source",
        choices=["csv", "synthetic"],
        default="csv",
        help="Use an input CSV or create a synthetic dataset.",
    )
    parser.add_argument("--start", default="2022-01-01", help="Synthetic start timestamp.")
    parser.add_argument("--periods", type=int, default=24 * 365 * 2, help="Synthetic row count.")
    parser.add_argument("--seed", type=int, default=42, help="Synthetic random seed.")
    args = parser.parse_args()

    if args.source == "csv":
        if not args.input:
            raise SystemExit("--input is required when --source csv")
        df = load_data(args.input)
    else:
        df = generate_synthetic_weather_data(start=args.start, periods=args.periods, seed=args.seed)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} rows to {output_path}")


if __name__ == "__main__":
    main()

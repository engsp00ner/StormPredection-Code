from __future__ import annotations

import argparse
from pathlib import Path
import sys

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))


def create_labels(
    df: pd.DataFrame,
    horizon_hours: int = 3,
    pressure_drop_threshold: float = 3.0,
    use_weather_code: bool = False,
    weather_code_col: str = "weather_code",
    storm_codes: list[int] | None = None,
) -> pd.DataFrame:
    """Create a binary target for a storm within the next horizon."""
    labeled = df.copy()
    labeled["timestamp"] = pd.to_datetime(labeled["timestamp"], errors="coerce")
    labeled = labeled.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

    if use_weather_code and weather_code_col in labeled.columns:
        future_storms = [
            labeled[weather_code_col].shift(-step).isin(storm_codes or [95, 96, 99])
            for step in range(1, horizon_hours + 1)
        ]
        storm_future = pd.concat(future_storms, axis=1).any(axis=1)
        labeled["label"] = storm_future.astype("Int64")
    else:
        future_pressures = pd.concat(
            [labeled["pressure_hPa"].shift(-step) for step in range(1, horizon_hours + 1)],
            axis=1,
        )
        future_min_pressure = future_pressures.min(axis=1)
        pressure_drop = labeled["pressure_hPa"] - future_min_pressure
        labeled["label"] = (pressure_drop > pressure_drop_threshold).astype("Int64")

    labeled.loc[labeled.index[-horizon_hours:], "label"] = pd.NA
    return labeled


def main() -> None:
    parser = argparse.ArgumentParser(description="Create storm labels from engineered features.")
    parser.add_argument("--input", required=True, help="Path to feature CSV.")
    parser.add_argument("--output", required=True, help="Path to labeled CSV.")
    parser.add_argument("--horizon", type=int, default=3, help="Look-ahead horizon in hours.")
    parser.add_argument(
        "--pressure-drop-threshold",
        type=float,
        default=3.0,
        help="Pressure drop threshold used for weak supervision.",
    )
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    labeled = create_labels(
        df,
        horizon_hours=args.horizon,
        pressure_drop_threshold=args.pressure_drop_threshold,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    labeled.to_csv(output_path, index=False)
    raw_distribution = labeled["label"].dropna().value_counts(normalize=True).sort_index().to_dict()
    distribution = {int(key): round(float(value), 6) for key, value in raw_distribution.items()}
    print(f"Saved {len(labeled)} labeled rows to {output_path}")
    print(f"Class distribution: {distribution}")


if __name__ == "__main__":
    main()

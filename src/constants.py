"""Shared constants for the storm prediction pipeline."""

from __future__ import annotations

FEATURE_COLS = [
    "pressure_hPa",
    "temperature_C",
    "pressure_lag_1h",
    "pressure_lag_2h",
    "pressure_lag_3h",
    "temp_lag_1h",
    "temp_lag_2h",
    "pressure_diff_1h",
    "pressure_diff_3h",
    "pressure_tendency",
    "pressure_rolling_mean_3h",
    "pressure_rolling_std_3h",
    "pressure_rolling_min_3h",
    "temp_rolling_mean_3h",
    "hour_of_day",
    "month",
]

REQUIRED_COLUMNS = ["timestamp", "pressure_hPa", "temperature_C"]

RISK_THRESHOLDS = {
    0.8: "HIGH",
    0.6: "MEDIUM",
    0.3: "LOW",
}


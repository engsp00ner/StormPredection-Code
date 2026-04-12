from __future__ import annotations

import unittest

import pandas as pd

from src.labels import create_labels


class LabelCreationTests(unittest.TestCase):
    def test_pressure_drop_within_horizon_creates_positive_label(self) -> None:
        df = pd.DataFrame(
            {
                "timestamp": pd.date_range("2026-01-01", periods=6, freq="h"),
                "pressure_hPa": [1013.0, 1012.8, 1011.9, 1009.0, 1008.5, 1008.3],
                "temperature_C": [20.0, 20.1, 19.9, 19.0, 18.8, 18.7],
            }
        )

        labeled = create_labels(df, horizon_hours=3, pressure_drop_threshold=3.0)

        self.assertEqual(int(labeled.loc[0, "label"]), 1)
        self.assertEqual(int(labeled.loc[1, "label"]), 1)
        self.assertTrue(pd.isna(labeled.loc[5, "label"]))


if __name__ == "__main__":
    unittest.main()


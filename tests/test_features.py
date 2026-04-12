from __future__ import annotations

import unittest

import pandas as pd

from src.constants import FEATURE_COLS
from src.features import generate_features


class FeatureGenerationTests(unittest.TestCase):
    def test_generate_features_creates_required_columns(self) -> None:
        df = pd.DataFrame(
            {
                "timestamp": pd.date_range("2026-01-01", periods=5, freq="h"),
                "pressure_hPa": [1012.0, 1011.5, 1010.2, 1008.7, 1007.9],
                "temperature_C": [22.0, 21.7, 21.2, 20.8, 20.5],
            }
        )

        featured = generate_features(df)

        for column in FEATURE_COLS:
            self.assertIn(column, featured.columns)
        self.assertAlmostEqual(featured.loc[3, "pressure_diff_3h"], -3.3, places=2)
        self.assertEqual(int(featured.loc[4, "hour_of_day"]), 4)


if __name__ == "__main__":
    unittest.main()


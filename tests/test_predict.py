from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from src.data_loader import generate_synthetic_weather_data
from src.features import generate_features
from src.labels import create_labels
from src.predict import predict_from_payload
from src.train import train


class PredictionTests(unittest.TestCase):
    def test_predict_accepts_json_history(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            labeled_path = root / "weather_labeled.csv"
            model_path = root / "storm_model.pkl"

            df = generate_synthetic_weather_data(periods=24 * 30)
            featured = generate_features(df)
            labeled = create_labels(featured)
            labeled.to_csv(labeled_path, index=False)

            train(str(labeled_path), str(model_path))

            payload = (
                df.tail(6)[["timestamp", "pressure_hPa", "temperature_C"]]
                .assign(timestamp=lambda frame: frame["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S"))
                .to_dict(orient="records")
            )

            result = predict_from_payload(str(model_path), payload)
            self.assertIn("storm_probability", result)
            self.assertIn("prediction", result)
            self.assertIn("risk_level", result)


if __name__ == "__main__":
    unittest.main()


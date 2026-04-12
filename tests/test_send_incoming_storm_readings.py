from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from src.data_loader import generate_synthetic_weather_data
from src.features import generate_features
from src.labels import create_labels
from src.train import train


MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "storm_webapp"
    / "tools"
    / "send_incoming_storm_readings.py"
)
MODULE_SPEC = importlib.util.spec_from_file_location("send_incoming_storm_readings", MODULE_PATH)
assert MODULE_SPEC is not None
assert MODULE_SPEC.loader is not None
send_incoming_storm_readings = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(send_incoming_storm_readings)


class SendIncomingStormReadingsTests(unittest.TestCase):
    def test_build_storm_readings_include_pressure(self) -> None:
        base_time = datetime(2026, 4, 11, 12, 0, tzinfo=timezone.utc)

        readings = send_incoming_storm_readings.build_storm_readings(
            base_time,
            source="test",
        )

        self.assertEqual(len(readings), len(send_incoming_storm_readings.STORM_PROFILE))
        self.assertEqual(readings[0]["pressure_hPa"], 1016.28)
        self.assertEqual(readings[0]["temperature_C"], 28.14)
        self.assertEqual(readings[0]["source"], "test")
        self.assertEqual(readings[0]["timestamp"], "2026-03-18T04:00:00+00:00")
        self.assertEqual(readings[1]["timestamp"], "2026-03-18T05:00:00+00:00")

    def test_profile_can_be_checked_against_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            labeled_path = root / "weather_labeled.csv"
            model_path = root / "storm_model.pkl"

            df = generate_synthetic_weather_data(periods=24 * 30)
            featured = generate_features(df)
            labeled = create_labels(featured)
            labeled.to_csv(labeled_path, index=False)

            train(str(labeled_path), str(model_path))

            readings = send_incoming_storm_readings.build_storm_readings(
                datetime(2026, 4, 11, 12, 0, tzinfo=timezone.utc),
                source="test",
            )
            result = send_incoming_storm_readings.test_profile_against_model(
                readings,
                str(model_path),
            )

            self.assertIn("storm_probability", result)
            self.assertIn("prediction", result)
            self.assertIn("risk_level", result)

    def test_checked_in_storm_profile_triggers_tuned_model(self) -> None:
        model_path = Path(__file__).resolve().parents[1] / "models" / "storm_model.pkl"
        metadata_path = Path(__file__).resolve().parents[1] / "models" / "model_metadata.json"

        readings = send_incoming_storm_readings.build_storm_readings(
            datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
            source="test",
        )
        result = send_incoming_storm_readings.test_profile_against_model(
            readings,
            str(model_path),
            str(metadata_path),
        )

        self.assertEqual(result.get("prediction"), 1)


if __name__ == "__main__":
    unittest.main()

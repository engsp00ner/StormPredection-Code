from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
import sys

import joblib
import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import FEATURE_COLS
from src.constants import RISK_THRESHOLDS
from src.features import generate_features


def classify_risk(probability: float) -> str:
    for threshold in sorted(RISK_THRESHOLDS.keys(), reverse=True):
        if probability >= threshold:
            return RISK_THRESHOLDS[threshold]
    return "LOW"


class StormPredictor:
    """Predict storms from a rolling buffer of recent sensor readings."""

    DEFAULT_DECISION_THRESHOLD = 0.85

    def __init__(
        self,
        model_path: str,
        buffer_size: int = 12,
        metadata_path: str | None = None,
    ) -> None:
        self.model = joblib.load(model_path)
        self.buffer: deque[dict] = deque(maxlen=buffer_size)
        self.decision_threshold = self._load_threshold(model_path, metadata_path)

    @staticmethod
    def _load_threshold(model_path: str, metadata_path: str | None) -> float:
        candidate_paths = []
        if metadata_path:
            candidate_paths.append(Path(metadata_path))
        candidate_paths.append(Path(model_path).with_name("model_metadata.json"))

        for candidate in candidate_paths:
            if candidate.exists():
                try:
                    metadata = json.loads(candidate.read_text())
                    return float(
                        metadata.get("decision_threshold", StormPredictor.DEFAULT_DECISION_THRESHOLD)
                    )
                except Exception:
                    return StormPredictor.DEFAULT_DECISION_THRESHOLD
        return StormPredictor.DEFAULT_DECISION_THRESHOLD

    def add_reading(self, reading: dict) -> dict[str, object]:
        self.buffer.append(reading)
        if len(self.buffer) < 4:
            return {"status": "buffering", "readings": len(self.buffer)}

        frame = pd.DataFrame(list(self.buffer))
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
        frame = frame.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

        featured = generate_features(frame).dropna(subset=FEATURE_COLS)
        if featured.empty:
            return {"status": "insufficient_features", "readings": len(self.buffer)}

        latest = featured.iloc[[-1]][FEATURE_COLS]
        probability = float(self.model.predict_proba(latest)[0][1])
        prediction = int(probability >= self.decision_threshold)
        return {
            "storm_probability": round(probability, 4),
            "prediction": prediction,
            "risk_level": classify_risk(probability),
            "decision_threshold": round(self.decision_threshold, 2),
        }


def predict_from_payload(
    model_path: str,
    payload: dict | list[dict],
    metadata_path: str | None = None,
) -> dict[str, object]:
    predictor = StormPredictor(model_path=model_path, metadata_path=metadata_path)
    readings = payload if isinstance(payload, list) else [payload]
    result: dict[str, object] = {"status": "buffering", "readings": 0}
    for reading in readings:
        result = predictor.add_reading(reading)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Run storm prediction from JSON readings.")
    parser.add_argument("--model", required=True, help="Path to trained model.")
    parser.add_argument("--metadata", help="Optional metadata path with tuned threshold.")
    parser.add_argument("--input", default="-", help="JSON file path, or '-' for stdin.")
    args = parser.parse_args()

    if args.input == "-":
        payload = json.load(__import__("sys").stdin)
    else:
        payload = json.loads(Path(args.input).read_text())

    result = predict_from_payload(args.model, payload, metadata_path=args.metadata)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

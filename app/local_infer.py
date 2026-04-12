from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.predict import predict_from_payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Local inference wrapper for storm prediction.")
    parser.add_argument("--model", default="models/storm_model.pkl", help="Path to trained model.")
    parser.add_argument("--metadata", help="Optional metadata path with tuned threshold.")
    parser.add_argument("--input", required=True, help="Path to a JSON reading or list of readings.")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text())
    result = predict_from_payload(args.model, payload, metadata_path=args.metadata)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

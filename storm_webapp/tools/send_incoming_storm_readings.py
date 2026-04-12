"""
Send an aggressive 2-minute low-pressure sequence to the live ingest API.

This is intended to stress the prediction path with incoming-storm-like readings.
It does not guarantee the current trained model will classify the sequence as a
storm, but it will exercise the ingest, prediction, websocket, and alert paths.
It can also validate the generated profile against a local trained model.

Usage:
    python tools/send_incoming_storm_readings.py --url http://127.0.0.1:8000 --api-key change-me
    python tools/send_incoming_storm_readings.py --model models/storm_model.pkl --model-only
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import time

import requests


# This sequence is sourced from data/processed/weather_labeled.csv.
# The final two records in this 6-row window have label=1, and the tuned
# model classifies the last reading as an incoming storm.
STORM_PROFILE = [
    {"pressure_hPa": 1016.28, "temperature_C": 28.14},
    {"pressure_hPa": 1016.43, "temperature_C": 29.33},
    {"pressure_hPa": 1015.59, "temperature_C": 30.63},
    {"pressure_hPa": 1015.20, "temperature_C": 29.67},
    {"pressure_hPa": 1016.66, "temperature_C": 27.86},
    {"pressure_hPa": 1016.22, "temperature_C": 29.07},
    {"pressure_hPa": 1015.74, "temperature_C": 28.44},
    {"pressure_hPa": 1016.48, "temperature_C": 26.88},
    {"pressure_hPa": 1015.61, "temperature_C": 26.01},
    {"pressure_hPa": 1013.94, "temperature_C": 24.00},
]

STORM_PROFILE_MONTH = 3
STORM_PROFILE_DAY = 18
STORM_PROFILE_START_HOUR = 4


def build_storm_readings(
    base_time: datetime,
    source: str = "simulator",
) -> list[dict[str, object]]:
    timestamp_anchor = base_time.astimezone(timezone.utc).replace(
        month=STORM_PROFILE_MONTH,
        day=STORM_PROFILE_DAY,
        hour=STORM_PROFILE_START_HOUR,
        minute=base_time.minute,
        second=base_time.second,
        microsecond=0,
    )
    readings: list[dict[str, object]] = []
    for index, profile in enumerate(STORM_PROFILE):
        readings.append(
            {
                "timestamp": (timestamp_anchor + timedelta(hours=index)).isoformat(
                    timespec="seconds"
                ),
                "pressure_hPa": profile["pressure_hPa"],
                "temperature_C": profile["temperature_C"],
                "source": source,
            }
        )
    return readings


def test_profile_against_model(
    readings: list[dict[str, object]],
    model_path: str,
    metadata_path: str | None = None,
) -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.append(str(repo_root))

    from src.predict import predict_from_payload

    return predict_from_payload(model_path, readings, metadata_path=metadata_path)


def print_model_result(result: dict[str, object]) -> None:
    status = result.get("status")
    if status:
        print(f"[model] status={status} | readings={result.get('readings')}")
        return

    probability = float(result.get("storm_probability", 0.0))
    prediction = result.get("prediction")
    risk_level = result.get("risk_level", "UNKNOWN")
    threshold = result.get("decision_threshold")
    print(
        f"[model] probability={probability:.2%} | prediction={prediction} | "
        f"risk={risk_level} | threshold={threshold}"
    )


def run(
    url: str,
    api_key: str,
    interval_seconds: int,
    model_path: str | None = None,
    metadata_path: str | None = None,
    model_only: bool = False,
) -> None:
    base_time = datetime.now(timezone.utc)
    readings = build_storm_readings(base_time)

    if model_path:
        model_result = test_profile_against_model(readings, model_path, metadata_path)
        print_model_result(model_result)

    if model_only:
        return

    session = requests.Session()
    session.headers.update(
        {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        }
    )

    for index, payload in enumerate(readings):
        pressure = float(payload["pressure_hPa"])
        temperature = float(payload["temperature_C"])

        try:
            response = session.post(f"{url}/api/v1/readings/", json=payload, timeout=120)
            try:
                body = response.json()
            except ValueError:
                body = {}
            print(
                f"[{payload['timestamp']}] "
                f"P={pressure:.1f} T={temperature:.1f} -> {response.status_code} | "
                f"status={body.get('status')} | prediction={body.get('prediction')}"
            )
        except Exception as exc:  # noqa: BLE001 - CLI utility should report and stop
            print(f"[ERROR] {exc}")
            break

        if index < len(STORM_PROFILE) - 1:
            time.sleep(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--api-key", default="MyStormPredectionKey")
    parser.add_argument("--interval", type=int, default=5)
    parser.add_argument("--model", help="Optional local model path for validating the storm profile.")
    parser.add_argument("--metadata", help="Optional metadata path with tuned threshold.")
    parser.add_argument(
        "--model-only",
        action="store_true",
        help="Only run the local model validation without posting to the ingest API.",
    )
    args = parser.parse_args()
    if args.model_only and not args.model:
        parser.error("--model-only requires --model")
    run(args.url, args.api_key, args.interval, args.model, args.metadata, args.model_only)


if __name__ == "__main__":
    main()

"""
Send an aggressive 2-minute low-pressure sequence to the live ingest API.

This is intended to stress the prediction path with incoming-storm-like readings.
It does not guarantee the current trained model will classify the sequence as a
storm, but it will exercise the ingest, prediction, websocket, and alert paths.

Usage:
    python tools/send_incoming_storm_readings.py --url http://127.0.0.1:8000 --api-key change-me
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import time

import requests


STORM_PROFILE = [
    (996.3, 25.5),
    (992.9, 26.0),
    (993.2, 25.3),
    (990.7, 24.6),
    (990.0, 24.9),
    (988.2, 24.5),
    (985.1, 23.9),
    (985.7, 23.2),
    (986.3, 23.4),
    (984.9, 24.1),
    (985.7, 23.9),
    (985.3, 23.9),
    (984.8, 24.0),
    (983.9, 23.8),
    (983.4, 23.6),
    (982.8, 23.5),
    (982.2, 23.4),
    (981.7, 23.2),
    (981.1, 23.0),
    (980.8, 22.9),
    (980.5, 22.8),
    (980.1, 22.7),
    (979.8, 22.6),
    (979.5, 22.5),
]


def run(url: str, api_key: str, interval_seconds: int) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        }
    )

    base_time = datetime.now(timezone.utc)

    for index, (pressure, temperature) in enumerate(STORM_PROFILE):
        payload = {
            "timestamp": (base_time + timedelta(seconds=index * interval_seconds)).isoformat(
                timespec="seconds"
            ),
            "pressure_hPa": pressure,
            "temperature_C": temperature,
            "source": "simulator",
        }

        try:
            response = session.post(f"{url}/api/v1/readings/", json=payload, timeout=120)
            body = response.json()
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
    parser.add_argument("--api-key", default="change-me")
    parser.add_argument("--interval", type=int, default=5)
    args = parser.parse_args()
    run(args.url, args.api_key, args.interval)


if __name__ == "__main__":
    main()

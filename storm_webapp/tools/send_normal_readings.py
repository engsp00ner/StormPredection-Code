"""
Send a stable 2-minute non-storm sequence to the live ingest API.

Usage:
    python tools/send_normal_readings.py --url http://127.0.0.1:8000 --api-key change-me
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import time

import requests


NORMAL_PROFILE = [
    (1013.2, 24.2),
    (1013.1, 24.3),
    (1013.2, 24.2),
    (1013.0, 24.3),
    (1013.1, 24.2),
    (1013.0, 24.4),
    (1012.9, 24.3),
    (1013.0, 24.2),
    (1013.1, 24.3),
    (1013.0, 24.2),
    (1012.9, 24.4),
    (1013.0, 24.3),
    (1013.1, 24.2),
    (1013.2, 24.3),
    (1013.0, 24.4),
    (1012.9, 24.2),
    (1013.1, 24.3),
    (1013.2, 24.2),
    (1013.1, 24.3),
    (1013.0, 24.2),
    (1013.1, 24.4),
    (1013.0, 24.3),
    (1013.1, 24.2),
    (1013.2, 24.3),
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

    for index, (pressure, temperature) in enumerate(NORMAL_PROFILE):
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

        if index < len(NORMAL_PROFILE) - 1:
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

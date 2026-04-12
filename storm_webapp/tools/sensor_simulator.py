"""
Simulate ESP32 sensor readings for testing.
Usage: python tools/sensor_simulator.py [--url URL] [--mode normal|storm|cold] [--interval 60] [--api-key KEY]
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import random
import time

import requests


def simulate(url: str, api_key: str, interval: int, mode: str):
    session = requests.Session()
    session.headers.update(
        {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        }
    )

    pressure = 1013.0
    temperature = 22.0

    while True:
        if mode == "storm":
            pressure -= random.uniform(1.0, 3.0)
            temperature += random.uniform(-0.5, 0.5)
        elif mode == "cold":
            pressure += random.uniform(-0.5, 0.5)
            temperature -= random.uniform(0.3, 1.0)
        else:
            pressure += random.uniform(-0.5, 0.5)
            temperature += random.uniform(-0.3, 0.3)

        pressure = max(960.0, min(1040.0, pressure))
        temperature = max(-20.0, min(50.0, temperature))

        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "pressure_hPa": round(pressure, 2),
            "temperature_C": round(temperature, 2),
            "source": "simulator",
        }

        try:
            response = session.post(
                f"{url}/api/v1/readings/",
                json=payload,
                timeout=120,
            )
            print(
                f"[{payload['timestamp']}] P={pressure:.1f} T={temperature:.1f} "
                f"-> {response.status_code} | {response.json().get('prediction_status', '')}"
            )
        except Exception as exc:  # noqa: BLE001 - CLI utility should keep looping
            print(f"[ERROR] {exc}")

        time.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument(
        "--mode",
        default="normal",
        choices=["normal", "storm", "cold"],
    )
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--api-key", default="change-me")
    args = parser.parse_args()
    simulate(args.url, args.api_key, args.interval, args.mode)

"""Bridge package so `from src...` works when executed from storm_webapp/."""

from pathlib import Path

__path__ = [str(Path(__file__).resolve().parents[2] / "src")]

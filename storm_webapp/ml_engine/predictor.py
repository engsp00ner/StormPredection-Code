import logging
import sys
from pathlib import Path

from django.conf import settings

sys.path.insert(0, str(Path(settings.BASE_DIR).parent))

from src.predict import StormPredictor

logger = logging.getLogger("ml_engine")
PREDICTOR: StormPredictor | None = None


def initialize_predictor() -> None:
    global PREDICTOR

    try:
        PREDICTOR = StormPredictor(model_path=settings.STORM_MODEL_PATH)
        logger.info("StormPredictor loaded from %s", settings.STORM_MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        PREDICTOR = None


def get_predictor() -> StormPredictor | None:
    return PREDICTOR

from django.apps import AppConfig


class MlEngineConfig(AppConfig):
    name = "ml_engine"

    def ready(self) -> None:
        from ml_engine.predictor import initialize_predictor

        initialize_predictor()

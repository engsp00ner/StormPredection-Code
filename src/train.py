from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import joblib
import pandas as pd
from xgboost import XGBClassifier

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import FEATURE_COLS
from src.evaluate import evaluate_model
from src.evaluate import select_decision_threshold


def resolve_time_split(df: pd.DataFrame, split_date: str | None) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """Use the requested time split when valid, otherwise fall back to an 80/20 cutoff."""
    if split_date:
        split_ts = pd.Timestamp(split_date)
        train_df = df[df["timestamp"] < split_ts]
        val_df = df[df["timestamp"] >= split_ts]
        if not train_df.empty and not val_df.empty:
            return train_df, val_df, split_ts.isoformat()

    split_index = max(int(len(df) * 0.8), 1)
    if split_index >= len(df):
        split_index = len(df) - 1
    split_ts = df.iloc[split_index]["timestamp"]
    train_df = df.iloc[:split_index]
    val_df = df.iloc[split_index:]
    return train_df, val_df, pd.Timestamp(split_ts).isoformat()


def train(
    data_path: str,
    model_output: str,
    split_date: str | None = None,
    model_params: dict[str, object] | None = None,
) -> dict[str, object]:
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    df = df.dropna(subset=FEATURE_COLS + ["label"]).reset_index(drop=True)
    if len(df) < 20:
        raise ValueError("Need at least 20 labeled rows to train the model.")

    train_df, val_df, split_used = resolve_time_split(df, split_date)
    X_train = train_df[FEATURE_COLS]
    y_train = train_df["label"].astype(int)
    X_val = val_df[FEATURE_COLS]
    y_val = val_df["label"].astype(int)

    positives = max(int((y_train == 1).sum()), 1)
    negatives = max(int((y_train == 0).sum()), 1)
    ratio = negatives / positives

    params = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "scale_pos_weight": ratio,
        "eval_metric": "aucpr",
        "early_stopping_rounds": 30,
        "random_state": 42,
        "verbosity": 0,
    }
    if model_params:
        params.update(model_params)
        params["scale_pos_weight"] = model_params.get("scale_pos_weight", ratio)

    model = XGBClassifier(
        **params,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    val_probabilities = model.predict_proba(X_val)[:, 1]
    decision_threshold, threshold_metrics = select_decision_threshold(val_probabilities, y_val)

    output_path = Path(model_output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output_path)

    metrics = evaluate_model(model, X_val, y_val, threshold=decision_threshold)
    metadata = {
        "model_path": str(output_path),
        "features": FEATURE_COLS,
        "split_date": split_used,
        "decision_threshold": decision_threshold,
        "scale_pos_weight": ratio,
        "training_params": params,
        "train_rows": int(len(train_df)),
        "validation_rows": int(len(val_df)),
        "metrics": {k: v for k, v in metrics.items() if k != "classification_report"},
        "threshold_selection": threshold_metrics,
    }

    metadata_path = output_path.with_name("model_metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2))

    return {
        "model": model,
        "metrics": metrics,
        "metadata_path": str(metadata_path),
        "split_date": split_used,
        "decision_threshold": decision_threshold,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the Phase 1 storm model.")
    parser.add_argument("--data", required=True, help="Path to labeled feature CSV.")
    parser.add_argument("--output", required=True, help="Path to save the trained model.")
    parser.add_argument("--split", help="Optional timestamp boundary for the time-aware split.")
    args = parser.parse_args()

    result = train(args.data, args.output, split_date=args.split)
    metrics = result["metrics"]
    print(f"Model saved to {args.output}")
    print(f"Metadata saved to {result['metadata_path']}")
    print(f"Validation split starts at: {result['split_date']}")
    print(f"Decision threshold: {result['decision_threshold']:.2f}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall: {metrics['recall']:.4f}")
    print(f"F1: {metrics['f1']:.4f}")
    print(f"ROC-AUC: {metrics['roc_auc']:.4f}" if metrics["roc_auc"] is not None else "ROC-AUC: n/a")
    print(f"PR-AUC: {metrics['pr_auc']:.4f}" if metrics["pr_auc"] is not None else "PR-AUC: n/a")


if __name__ == "__main__":
    main()

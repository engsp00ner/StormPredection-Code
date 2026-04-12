from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.metrics import average_precision_score
from sklearn.metrics import classification_report
from sklearn.metrics import confusion_matrix
from sklearn.metrics import f1_score
from sklearn.metrics import precision_score
from sklearn.metrics import recall_score
from sklearn.metrics import roc_auc_score

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.constants import FEATURE_COLS


def evaluate_model(model, X: pd.DataFrame, y: pd.Series, threshold: float = 0.5) -> dict[str, object]:
    """Return the evaluation metrics required by the project spec."""
    probabilities = model.predict_proba(X)[:, 1]
    predictions = (probabilities >= threshold).astype(int)

    metrics = {
        "precision": float(precision_score(y, predictions, zero_division=0)),
        "recall": float(recall_score(y, predictions, zero_division=0)),
        "f1": float(f1_score(y, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y, probabilities)) if y.nunique() > 1 else None,
        "pr_auc": float(average_precision_score(y, probabilities)) if y.nunique() > 1 else None,
        "confusion_matrix": confusion_matrix(y, predictions).tolist(),
        "classification_report": classification_report(y, predictions, zero_division=0),
    }
    return metrics


def select_decision_threshold(
    probabilities: pd.Series | list[float],
    y_true: pd.Series,
    min_recall: float = 0.15,
) -> tuple[float, dict[str, object]]:
    """Choose a threshold that prefers recall first, then F1."""
    best_threshold = 0.8
    best_metrics: dict[str, object] | None = None
    candidates = [round(step / 100, 2) for step in range(10, 91, 5)]

    evaluation_frame = pd.DataFrame({"probability": probabilities, "label": y_true}).reset_index(drop=True)
    for threshold in candidates:
        predictions = (evaluation_frame["probability"] >= threshold).astype(int)
        precision = float(precision_score(evaluation_frame["label"], predictions, zero_division=0))
        recall = float(recall_score(evaluation_frame["label"], predictions, zero_division=0))
        f1 = float(f1_score(evaluation_frame["label"], predictions, zero_division=0))
        meets_target = recall >= min_recall
        candidate_metrics = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "meets_target": meets_target,
        }

        if best_metrics is None:
            best_threshold = threshold
            best_metrics = candidate_metrics
            continue

        current_score = (
            int(candidate_metrics["meets_target"]),
            candidate_metrics["f1"],
            candidate_metrics["precision"],
            candidate_metrics["recall"],
            -abs(threshold - 0.5),
        )
        best_score = (
            int(best_metrics["meets_target"]),
            best_metrics["f1"],
            best_metrics["precision"],
            best_metrics["recall"],
            -abs(best_threshold - 0.5),
        )
        if current_score > best_score:
            best_threshold = threshold
            best_metrics = candidate_metrics

    if best_metrics is None:
        best_metrics = {"precision": 0.0, "recall": 0.0, "f1": 0.0, "meets_target": False}
    return best_threshold, best_metrics


def load_metadata(metadata_path: str | Path | None) -> dict[str, object]:
    if not metadata_path or not Path(metadata_path).exists():
        return {}
    return json.loads(Path(metadata_path).read_text())


def resolve_eval_split(df: pd.DataFrame, split_date: str | None) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    if split_date:
        split_ts = pd.Timestamp(split_date)
        train_df = df[df["timestamp"] < split_ts]
        val_df = df[df["timestamp"] >= split_ts]
        if not train_df.empty and not val_df.empty:
            return train_df, val_df, split_ts.isoformat()

    split_index = max(int(len(df) * 0.8), 1)
    split_ts = df.iloc[split_index]["timestamp"]
    train_df = df.iloc[:split_index]
    val_df = df.iloc[split_index:]
    return train_df, val_df, pd.Timestamp(split_ts).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a trained storm model.")
    parser.add_argument("--model", required=True, help="Path to trained model.")
    parser.add_argument("--data", required=True, help="Path to labeled feature CSV.")
    parser.add_argument("--metadata", help="Optional metadata JSON written during training.")
    parser.add_argument("--split", help="Optional evaluation split timestamp override.")
    args = parser.parse_args()

    model = joblib.load(args.model)
    metadata = load_metadata(args.metadata)

    df = pd.read_csv(args.data, parse_dates=["timestamp"])
    df = df.dropna(subset=FEATURE_COLS + ["label"]).reset_index(drop=True)
    _, val_df, split_used = resolve_eval_split(df, args.split or metadata.get("split_date"))

    X_val = val_df[FEATURE_COLS]
    y_val = val_df["label"].astype(int)
    metrics = evaluate_model(model, X_val, y_val, threshold=float(metadata.get("decision_threshold", 0.5)))

    print(f"Evaluation split starts at: {split_used}")
    print(metrics["classification_report"])
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall: {metrics['recall']:.4f}")
    print(f"F1: {metrics['f1']:.4f}")
    print(f"ROC-AUC: {metrics['roc_auc']:.4f}" if metrics["roc_auc"] is not None else "ROC-AUC: n/a")
    print(f"PR-AUC: {metrics['pr_auc']:.4f}" if metrics["pr_auc"] is not None else "PR-AUC: n/a")
    print(f"Confusion matrix: {metrics['confusion_matrix']}")


if __name__ == "__main__":
    main()

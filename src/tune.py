from __future__ import annotations

import argparse
import itertools
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
from src.train import resolve_time_split


def tune_model(data_path: str, model_output: str, split_date: str | None = None) -> dict[str, object]:
    df = pd.read_csv(data_path, parse_dates=["timestamp"])
    df = df.dropna(subset=FEATURE_COLS + ["label"]).reset_index(drop=True)
    train_df, val_df, split_used = resolve_time_split(df, split_date)

    X_train = train_df[FEATURE_COLS]
    y_train = train_df["label"].astype(int)
    X_val = val_df[FEATURE_COLS]
    y_val = val_df["label"].astype(int)

    positives = max(int((y_train == 1).sum()), 1)
    negatives = max(int((y_train == 0).sum()), 1)
    ratio = negatives / positives

    param_grid = {
        "n_estimators": [200, 350],
        "max_depth": [2, 3],
        "learning_rate": [0.03, 0.05],
        "min_child_weight": [8, 12],
        "gamma": [1.0, 2.0],
        "subsample": [0.8],
        "colsample_bytree": [0.8, 1.0],
        "reg_lambda": [2.0, 4.0],
    }

    keys = list(param_grid.keys())
    combinations = [dict(zip(keys, values)) for values in itertools.product(*(param_grid[key] for key in keys))]

    best: dict[str, object] | None = None
    for params in combinations:
        candidate_params = {
            **params,
            "scale_pos_weight": ratio,
            "eval_metric": "aucpr",
            "early_stopping_rounds": 30,
            "random_state": 42,
            "verbosity": 0,
        }
        model = XGBClassifier(**candidate_params)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

        probabilities = model.predict_proba(X_val)[:, 1]
        threshold, threshold_metrics = select_decision_threshold(probabilities, y_val)
        metrics = evaluate_model(model, X_val, y_val, threshold=threshold)

        score = (
            int(threshold_metrics["meets_target"]),
            metrics["f1"],
            metrics["precision"],
            metrics["pr_auc"] if metrics["pr_auc"] is not None else -1.0,
            metrics["recall"],
        )
        if best is None or score > best["score"]:
            best = {
                "score": score,
                "model": model,
                "params": candidate_params,
                "metrics": metrics,
                "decision_threshold": threshold,
                "threshold_selection": threshold_metrics,
            }

    if best is None:
        raise RuntimeError("No model candidates were evaluated.")

    output_path = Path(model_output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(best["model"], output_path)

    metadata = {
        "model_path": str(output_path),
        "features": FEATURE_COLS,
        "split_date": split_used,
        "decision_threshold": best["decision_threshold"],
        "scale_pos_weight": ratio,
        "training_params": best["params"],
        "train_rows": int(len(train_df)),
        "validation_rows": int(len(val_df)),
        "metrics": {k: v for k, v in best["metrics"].items() if k != "classification_report"},
        "threshold_selection": best["threshold_selection"],
        "tuned": True,
        "search_candidates": len(combinations),
    }
    metadata_path = output_path.with_name("model_metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2))

    return {
        "model_output": str(output_path),
        "metadata_output": str(metadata_path),
        "split_date": split_used,
        "decision_threshold": best["decision_threshold"],
        "metrics": best["metrics"],
        "params": best["params"],
        "search_candidates": len(combinations),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Tune the Phase 1 storm model.")
    parser.add_argument("--data", required=True, help="Path to labeled feature CSV.")
    parser.add_argument("--output", required=True, help="Path to save the tuned model.")
    parser.add_argument("--split", help="Optional timestamp boundary for the time-aware split.")
    args = parser.parse_args()

    result = tune_model(args.data, args.output, split_date=args.split)
    metrics = result["metrics"]
    print(f"Tuned model saved to {result['model_output']}")
    print(f"Metadata saved to {result['metadata_output']}")
    print(f"Validation split starts at: {result['split_date']}")
    print(f"Search candidates: {result['search_candidates']}")
    print(f"Decision threshold: {result['decision_threshold']:.2f}")
    print(f"Best params: {result['params']}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall: {metrics['recall']:.4f}")
    print(f"F1: {metrics['f1']:.4f}")
    print(f"ROC-AUC: {metrics['roc_auc']:.4f}" if metrics["roc_auc"] is not None else "ROC-AUC: n/a")
    print(f"PR-AUC: {metrics['pr_auc']:.4f}" if metrics["pr_auc"] is not None else "PR-AUC: n/a")


if __name__ == "__main__":
    main()

"""Command-line fitting of task output files.

Usage:
    python -m ddt.fit data/*.txt --out results.csv
    python -m ddt.fit data/*.txt --models hyperbolic exponential --normalize

Reads tab- or comma-separated files written by task/ (or any file with the
hBayesDM dd columns), fits each participant, and writes one row per
participant x model plus mode-specific scores.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from .fitting import fit_all_models
from .models import MODELS
from .scoring import (adjusting_indifference_points, auc, fit_hyperbolic_ip,
                      johnson_bickel, score_kirby)


def load(paths) -> pd.DataFrame:
    frames = []
    for p in paths:
        sep = "\t" if Path(p).suffix in (".txt", ".tsv") else ","
        df = pd.read_csv(p, sep=sep)
        df["source_file"] = Path(p).name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    if "phase" in df.columns:
        df = df[df["phase"] == "main"]
    return df


def catch_failures(df: pd.DataFrame):
    if "is_catch" not in df.columns:
        return None
    c = df[df["is_catch"] == 1]
    return int(c["choice"].sum()) if len(c) else None


def mode_scores(df: pd.DataFrame) -> dict:
    mode = df["mode"].iloc[0] if "mode" in df.columns else None
    out = {"mode": mode}
    if mode == "kirby":
        out.update(score_kirby(df))
    elif mode == "adjusting":
        ip = adjusting_indifference_points(df)
        out["auc"] = auc(ip["delay"], ip["indiff_prop"])
        out["k_ip_hyperbolic"] = fit_hyperbolic_ip(ip["delay"], ip["indiff_prop"])
        out.update(johnson_bickel(ip["delay"], ip["indiff_prop"]))
        for _, r in ip.iterrows():
            out[f"ip_{int(r['delay'])}d"] = r["indiff_prop"]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--models", nargs="+", default=list(MODELS), choices=list(MODELS))
    ap.add_argument("--normalize", action="store_true",
                    help="divide amounts by each participant's mean later amount so beta is currency-free")
    ap.add_argument("--out", default="ddt_results.csv")
    args = ap.parse_args(argv)

    df = load(args.files)
    rows = []
    for sid, sub in df.groupby("subjID", sort=False):
        all_trials = sub
        trials = sub[sub["is_catch"] == 0] if "is_catch" in sub.columns else sub
        scale = float(trials["amount_later"].mean()) if args.normalize else 1.0
        fits = fit_all_models(trials, args.models, value_scale=scale)
        extra = mode_scores(trials)
        extra["catch_failures"] = catch_failures(all_trials)
        extra["value_scale"] = scale
        for _, f in fits.iterrows():
            rows.append({"subjID": sid, **extra, **f.to_dict()})

    res = pd.DataFrame(rows)
    res.to_csv(args.out, index=False)

    best = res.loc[res.groupby("subjID")["bic"].idxmin(), ["subjID", "model"]]
    print(f"Fitted {res['subjID'].nunique()} participant(s) -> {args.out}")
    print("Best model by BIC:", best["model"].value_counts().to_dict())
    print("Summed BIC by model:")
    print(res.groupby("model")["bic"].sum().sort_values().round(1).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())

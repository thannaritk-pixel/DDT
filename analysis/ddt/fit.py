"""Command-line fitting of task output files.

Usage:
    python -m ddt.fit data/*.txt --out results.csv
    python -m ddt.fit ddt_trials_20261107-1200.csv          # web app export
    python -m ddt.fit data/*.txt --models hyperbolic exponential --normalize

Reads tab- or comma-separated files written by task/, the web app's Drive
export (ddt_trials_*.csv) or any file with the hBayesDM dd columns. Fits each
session (session_id if present, otherwise subjID) and writes one row per
session x model plus mode-specific scores. Sessions flagged exclude = 1 in the
web app are skipped unless --include-excluded is given.
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
    ap.add_argument("--include-excluded", action="store_true",
                    help="also fit sessions marked exclude = 1 in the web app")
    ap.add_argument("--out", default="ddt_results.csv")
    args = ap.parse_args(argv)

    df = load(args.files)
    if "exclude" in df.columns and not args.include_excluded:
        n_ex = df.loc[df["exclude"] == 1, "session_id" if "session_id" in df.columns else "subjID"].nunique()
        if n_ex:
            print(f"Skipping {n_ex} excluded session(s)")
        df = df[df["exclude"] != 1]
    key = "session_id" if "session_id" in df.columns else "subjID"
    info_cols = [c for c in ("subjID", "group", "session_label") if c in df.columns and c != key]

    rows = []
    for sid, sub in df.groupby(key, sort=False):
        all_trials = sub
        trials = sub[sub["is_catch"] == 0] if "is_catch" in sub.columns else sub
        scale = float(trials["amount_later"].mean()) if args.normalize else 1.0
        fits = fit_all_models(trials, args.models, value_scale=scale)
        extra = {c: sub[c].iloc[0] for c in info_cols}
        extra.update(mode_scores(trials))
        extra["catch_failures"] = catch_failures(all_trials)
        extra["value_scale"] = scale
        for _, f in fits.iterrows():
            rows.append({key: sid, **extra, **f.to_dict()})

    res = pd.DataFrame(rows)
    res.to_csv(args.out, index=False)

    best = res.loc[res.groupby(key)["bic"].idxmin(), [key, "model"]]
    print(f"Fitted {res[key].nunique()} session(s) -> {args.out}")
    print("Best model by BIC:", best["model"].value_counts().to_dict())
    print("Summed BIC by model:")
    print(res.groupby("model")["bic"].sum().sort_values().round(1).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())

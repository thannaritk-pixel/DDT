"""Group comparison of fitted parameters.

    python -m ddt.compare ddt_results.csv --model hyperbolic --param log_k

For each task mode, compares the parameter between groups (Welch t-test,
Mann-Whitney U, Hedges' g for two groups; one-way ANOVA and Kruskal-Wallis for
more) and reports which model wins by summed BIC. log k is the usual outcome
because k is strongly right-skewed (Amlung et al., 2017).
Sessions whose estimate sits on a bound are reported and can be dropped with
--drop-at-bound.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
from scipy import stats


def hedges_g(a, b) -> float:
    na, nb = len(a), len(b)
    sp = np.sqrt(((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2))
    d = (np.mean(a) - np.mean(b)) / sp
    return float(d * (1 - 3 / (4 * (na + nb) - 9)))


def compare(res: pd.DataFrame, model="hyperbolic", param="log_k", drop_at_bound=False) -> str:
    out = []
    key = "session_id" if "session_id" in res.columns else "subjID"
    best = res.loc[res.groupby(key)["bic"].idxmin()]
    modes = res["mode"].dropna().unique() if "mode" in res.columns else [None]
    for mode in modes:
        r = res if mode is None else res[res["mode"] == mode]
        out.append(f"\n=== mode: {mode} ===")
        bic = r.groupby("model")["bic"].sum().sort_values()
        out.append("Summed BIC (lower is better): " + ", ".join(f"{m} {v:.1f}" for m, v in bic.items()))
        b = best if mode is None else best[best["mode"] == mode]
        out.append("Best model per session: " + str(b["model"].value_counts().to_dict()))

        m = r[r["model"] == model].copy()
        if "at_bound" in m.columns:
            nb = int(m["at_bound"].astype(bool).sum())
            if nb:
                out.append(f"{nb} session(s) with {model} estimate on a bound" +
                           (" (dropped)" if drop_at_bound else ""))
                if drop_at_bound:
                    m = m[~m["at_bound"].astype(bool)]
        if "group" not in m.columns or m["group"].nunique() < 2:
            out.append(f"{param}: mean {m[param].mean():.3f}, SD {m[param].std():.3f}, n {len(m)}")
            continue
        groups = {g: v[param].dropna().to_numpy() for g, v in m.groupby("group")}
        for g, v in groups.items():
            out.append(f"  {g}: n={len(v)}  mean={np.mean(v):.3f}  SD={np.std(v, ddof=1) if len(v) > 1 else float('nan'):.3f}"
                       f"  median={np.median(v):.3f}")
        vals = [v for v in groups.values() if len(v) >= 2]
        if len(vals) < 2:
            out.append("  (need at least 2 sessions per group for tests)")
        elif len(groups) == 2:
            a, c = vals
            t = stats.ttest_ind(a, c, equal_var=False)
            u = stats.mannwhitneyu(a, c, alternative="two-sided")
            names = list(groups)
            out.append(f"  Welch t = {t.statistic:.3f}, p = {t.pvalue:.4f}; Mann-Whitney U = {u.statistic:.1f}, p = {u.pvalue:.4f}; "
                       f"Hedges g ({names[0]} - {names[1]}) = {hedges_g(a, c):.3f}")
        else:
            f = stats.f_oneway(*vals)
            h = stats.kruskal(*vals)
            out.append(f"  ANOVA F = {f.statistic:.3f}, p = {f.pvalue:.4f}; Kruskal-Wallis H = {h.statistic:.3f}, p = {h.pvalue:.4f}")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results")
    ap.add_argument("--model", default="hyperbolic")
    ap.add_argument("--param", default="log_k")
    ap.add_argument("--drop-at-bound", action="store_true")
    a = ap.parse_args(argv)
    print(compare(pd.read_csv(a.results), a.model, a.param, a.drop_at_bound))


if __name__ == "__main__":
    main()

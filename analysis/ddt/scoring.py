"""Model-free / classic scoring methods.

* Kirby MCQ k by the consistency method (Kirby, Petry & Bickel, 1999).
* Indifference points from the adjusting-amount procedure (Du, Green & Myerson, 2002).
* Area under the curve (Myerson, Green & Warusawitharana, 2001).
* Nonsystematic-data criteria (Johnson & Bickel, 2008).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# The 27 MCQ items: (SIR, LDR, delay, magnitude). Same as task/designs.js.
KIRBY_27 = [
    (54, 55, 117, "M"), (55, 75, 61, "L"), (19, 25, 53, "S"), (31, 85, 7, "L"),
    (14, 25, 19, "S"), (47, 50, 160, "M"), (15, 35, 13, "S"), (25, 60, 14, "M"),
    (78, 80, 192, "L"), (40, 55, 62, "M"), (11, 30, 7, "S"), (67, 75, 119, "L"),
    (34, 35, 186, "S"), (27, 50, 21, "M"), (69, 85, 91, "L"), (49, 60, 89, "M"),
    (80, 85, 157, "L"), (24, 35, 29, "S"), (33, 80, 14, "L"), (28, 30, 179, "S"),
    (34, 50, 30, "M"), (25, 30, 80, "S"), (41, 75, 20, "L"), (54, 60, 111, "M"),
    (54, 80, 30, "L"), (22, 25, 136, "S"), (20, 55, 7, "M"),
]


def kirby_consistency_k(k_items, choice_later) -> dict:
    """Kirby consistency method for one set of items.

    For each candidate k, a hyperbolic discounter should choose the later
    reward when the item's indifference k is greater than the candidate k.
    Candidates are the geometric midpoints between adjacent item ks plus values
    just beyond the ends. The k with the highest consistency is chosen; ties are
    resolved by the geometric mean of the tied candidates.
    """
    k_items = np.asarray(k_items, dtype=float)
    c = np.asarray(choice_later, dtype=int)
    ks = np.unique(k_items)
    mids = np.sqrt(ks[:-1] * ks[1:])
    candidates = np.concatenate([[ks[0] / 2], mids, [ks[-1] * 2]])
    cons = np.array([np.mean((k_items > kc).astype(int) == c) for kc in candidates])
    best = np.flatnonzero(np.isclose(cons, cons.max()))
    k = float(np.exp(np.mean(np.log(candidates[best]))))
    return {"k": k, "log_k": float(np.log(k)), "consistency": float(cons.max())}


def score_kirby(df: pd.DataFrame) -> dict:
    """Overall and per-magnitude k for Kirby MCQ data (needs `block` = S/M/L
    and `k_indiff` columns as written by the task)."""
    out = {}
    res = kirby_consistency_k(df["k_indiff"], df["choice"])
    out.update({f"kirby_{k}": v for k, v in res.items()})
    if "block" in df.columns:
        for mag in ("S", "M", "L"):
            sub = df[df["block"] == mag]
            if len(sub):
                r = kirby_consistency_k(sub["k_indiff"], sub["choice"])
                out[f"kirby_k_{mag}"] = r["k"]
                out[f"kirby_consistency_{mag}"] = r["consistency"]
    out["prop_later"] = float(df["choice"].mean())
    return out


def adjusting_indifference_points(df: pd.DataFrame, n_steps: int = 6) -> pd.DataFrame:
    """Replay the adjusting-amount staircase to recover indifference points.

    Start: SS = LL/2, step = LL/4. After each choice SS moves by the current
    step (up after a later choice, down after a sooner choice) and the step
    halves. The indifference point is SS after the final adjustment.
    """
    rows = []
    for d, sub in df.groupby("delay_later", sort=True):
        ll = float(sub["amount_later"].iloc[0])
        ss, step = ll / 2, ll / 4
        for c in sub["choice"].to_numpy()[:n_steps]:
            ss = min(max(ss + (step if c == 1 else -step), 0.0), ll)
            step /= 2
        rows.append({"delay": float(d), "amount_later": ll, "indiff": ss, "indiff_prop": ss / ll})
    return pd.DataFrame(rows)


def auc(delays, indiff_prop) -> float:
    """Normalised area under the empirical discounting curve (Myerson et al., 2001).
    Adds the point (0, 1). 1 = no discounting, 0 = maximal discounting."""
    d = np.concatenate([[0.0], np.asarray(delays, dtype=float)])
    v = np.concatenate([[1.0], np.asarray(indiff_prop, dtype=float)])
    order = np.argsort(d)
    d, v = d[order] / d.max(), v[order]
    return float(np.sum((d[1:] - d[:-1]) * (v[1:] + v[:-1]) / 2))


def johnson_bickel(delays, indiff_prop) -> dict:
    """Johnson & Bickel (2008) criteria for nonsystematic indifference points.
    C1: an IP exceeds the preceding IP by more than 20% of the later amount.
    C2: the last IP is not at least 10% of the later amount below the first."""
    order = np.argsort(delays)
    v = np.asarray(indiff_prop, dtype=float)[order]
    c1 = bool(np.any(np.diff(v) > 0.20))
    c2 = bool((v[0] - v[-1]) < 0.10)
    return {"jb_c1_fail": c1, "jb_c2_fail": c2, "jb_nonsystematic": c1 or c2}


def fit_hyperbolic_ip(delays, indiff_prop) -> float:
    """Least-squares fit of V = 1/(1+kD) to indifference points (Mazur, 1987)."""
    from scipy.optimize import minimize_scalar

    d = np.asarray(delays, dtype=float)
    v = np.asarray(indiff_prop, dtype=float)
    f = lambda lk: np.sum((v - 1 / (1 + np.exp(lk) * d)) ** 2)  # noqa: E731
    r = minimize_scalar(f, bounds=(np.log(1e-6), np.log(20)), method="bounded")
    return float(np.exp(r.x))

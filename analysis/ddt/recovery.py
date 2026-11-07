"""Parameter recovery for the task designs.

Simulates hyperbolic agents with known (k, beta) on a design, refits them and
reports the correlation between true and recovered log k. Run this before data
collection to check the design can recover parameters in your expected range
(Wilson & Collins, 2019).

    python -m ddt.recovery --design kirby --n 200
    python -m ddt.recovery --design grid --n 200
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from .fitting import fit_model, simulate
from .scoring import KIRBY_27

GRID_DELAYS = [1, 7, 14, 30, 90, 180, 365]
GRID_RATIOS = [0.15, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9, 0.96]


def design(name: str, scale: float = 10.0, rng=None) -> pd.DataFrame:
    rng = np.random.default_rng(rng)
    if name == "kirby":
        rows = [dict(amount_sooner=s * scale, delay_sooner=0, amount_later=l * scale, delay_later=d)
                for s, l, d, _ in KIRBY_27]
    elif name == "grid":
        rows = []
        for d in GRID_DELAYS:
            for r in GRID_RATIOS:
                ll = rng.choice([40, 60, 85]) * scale
                rows.append(dict(amount_sooner=round(ll * r), delay_sooner=0, amount_later=ll, delay_later=d))
    else:
        raise ValueError(name)
    return pd.DataFrame(rows)


def run(design_name="grid", n=100, seed=0, scale=10.0):
    rng = np.random.default_rng(seed)
    des = design(design_name, scale, rng)
    out = []
    for _ in range(n):
        # log k ~ N(-4.5, 1.2) roughly matches community samples (e.g. Kirby et al., 1999).
        k = float(np.exp(rng.normal(-4.5, 1.2)))
        # beta on raw currency units: scale so that choice noise is moderate.
        beta = float(np.exp(rng.normal(np.log(1.0 / scale), 0.5)))
        sim = simulate("hyperbolic", {"k": k, "beta": beta}, des, rng)
        f = fit_model(sim, "hyperbolic")
        out.append({"k_true": k, "beta_true": beta, "k_fit": f["k"], "beta_fit": f["beta"]})
    res = pd.DataFrame(out)
    r_k = np.corrcoef(np.log(res.k_true), np.log(res.k_fit))[0, 1]
    r_b = np.corrcoef(np.log(res.beta_true), np.log(res.beta_fit))[0, 1]
    return res, r_k, r_b


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--design", default="grid", choices=["kirby", "grid"])
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    res, r_k, r_b = run(a.design, a.n, a.seed)
    print(f"design={a.design} n={a.n}  r(log k)={r_k:.3f}  r(log beta)={r_b:.3f}")
    if a.out:
        res.to_csv(a.out, index=False)


if __name__ == "__main__":
    main()

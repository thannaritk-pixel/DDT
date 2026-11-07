"""Maximum-likelihood fitting and model comparison for single participants."""
from __future__ import annotations

import itertools

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .models import MODELS, Model, neg_log_lik

REQUIRED = ["delay_later", "amount_later", "delay_sooner", "amount_sooner", "choice"]


def to_arrays(df: pd.DataFrame, value_scale: float = 1.0) -> dict:
    """Convert a trial table to arrays. ``value_scale`` divides amounts so that
    beta is comparable across currencies (e.g. pass the mean later amount)."""
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    out = {c: df[c].to_numpy(dtype=float) for c in REQUIRED}
    out["amount_later"] = out["amount_later"] / value_scale
    out["amount_sooner"] = out["amount_sooner"] / value_scale
    return out


def fit_model(df: pd.DataFrame, model: Model | str, value_scale: float = 1.0) -> dict:
    """Fit one model to one participant by MLE with a grid of starting points."""
    if isinstance(model, str):
        model = MODELS[model]
    data = to_arrays(df, value_scale)
    n = len(data["choice"])
    bounds = [p.bounds for p in model.params]

    best = None
    for start in itertools.product(*[p.starts for p in model.params]):
        x0 = [np.clip(p.to_unbounded(v), *p.bounds) for p, v in zip(model.params, start)]
        res = minimize(neg_log_lik, x0, args=(model, data), method="L-BFGS-B", bounds=bounds)
        if best is None or res.fun < best.fun:
            best = res

    nll = float(best.fun)
    theta = model.unpack(best.x)
    kparams = model.n_params
    out = {
        "model": model.name,
        "n_trials": n,
        "nll": nll,
        "aic": 2 * nll + 2 * kparams,
        "bic": 2 * nll + kparams * np.log(n),
        # McFadden pseudo-R2 against a chance model (p = 0.5)
        "pseudo_r2": 1 - nll / (n * np.log(2)),
        "converged": bool(best.success),
    }
    for name, v in theta.items():
        out[name] = float(v)
    if "k" in theta:
        out["log_k"] = float(np.log(theta["k"]))
    # Flag estimates stuck on a bound: these are poorly identified (e.g. a
    # participant who always chose the later option).
    out["at_bound"] = bool(any(np.isclose(v, b, atol=1e-3).any()
                               for v, b in zip(best.x, bounds)))
    return out


def fit_all_models(df: pd.DataFrame, models=None, value_scale: float = 1.0) -> pd.DataFrame:
    models = models or list(MODELS)
    rows = [fit_model(df, m, value_scale) for m in models]
    res = pd.DataFrame(rows)
    # Akaike/Schwarz weights within participant.
    for crit in ("aic", "bic"):
        d = res[crit] - res[crit].min()
        w = np.exp(-0.5 * d)
        res[f"{crit}_weight"] = w / w.sum()
    return res


def simulate(model: Model | str, theta: dict, design: pd.DataFrame, rng=None) -> pd.DataFrame:
    """Simulate choices for a design table given true parameters."""
    if isinstance(model, str):
        model = MODELS[model]
    rng = np.random.default_rng(rng)
    d = to_arrays(design.assign(choice=0))
    p = model.p_later(theta, d["amount_sooner"], d["delay_sooner"], d["amount_later"], d["delay_later"])
    out = design.copy()
    out["choice"] = (rng.random(len(p)) < p).astype(int)
    out["p_later_true"] = p
    return out

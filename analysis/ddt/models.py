"""Discounting models and choice rule.

Every model has the same structure:

    V(A, D)   = A * f(D; theta)                     subjective value
    P(later)  = 1 / (1 + exp(-beta * (V_LL - V_SS))) softmax / logistic choice

``f`` is the discount function. ``beta`` (inverse temperature) captures choice
consistency. This matches the generative model used by hBayesDM's ``dd_*``
models (Ahn, Haines & Zhang, 2017), so parameters are directly comparable.

Parameters are optimised on an unbounded scale (log for positive parameters,
logit for parameters in (0, 1)) and reported on their natural scale.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

import numpy as np

# ----- parameter transforms -------------------------------------------------


def _exp(x):
    return np.exp(x)


def _log(x):
    return np.log(x)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _logit(p):
    return np.log(p / (1.0 - p))


@dataclass(frozen=True)
class Param:
    name: str
    to_natural: Callable
    to_unbounded: Callable
    bounds: tuple  # bounds on the unbounded scale
    starts: Sequence[float]  # starting values on the natural scale


K = Param("k", _exp, _log, (np.log(1e-6), np.log(20.0)), (1e-4, 1e-2, 0.1, 1.0))
BETA = Param("beta", _exp, _log, (np.log(1e-4), np.log(50.0)), (0.05, 0.5, 2.0))
S = Param("s", _exp, _log, (np.log(0.05), np.log(5.0)), (0.5, 1.0))
BQH = Param("b", _sigmoid, _logit, (-8.0, 8.0), (0.5, 0.9))  # present bias beta in (0,1)
DELTA = Param("delta", _sigmoid, _logit, (0.0, 12.0), (0.99, 0.999))  # per-day discount factor


# ----- discount functions ---------------------------------------------------


def exponential(D, k):
    """Samuelson (1937): f = exp(-k D)."""
    return np.exp(-k * D)


def hyperbolic(D, k):
    """Mazur (1987): f = 1 / (1 + k D)."""
    return 1.0 / (1.0 + k * D)


def hyperboloid(D, k, s):
    """Green & Myerson (2004): f = 1 / (1 + k D)^s."""
    return 1.0 / np.power(1.0 + k * D, s)


def quasi_hyperbolic(D, b, delta):
    """Laibson (1997) beta-delta: f = 1 if D = 0, else b * delta^D."""
    D = np.asarray(D, dtype=float)
    return np.where(D == 0, 1.0, b * np.power(delta, D))


@dataclass(frozen=True)
class Model:
    name: str
    params: tuple  # discount-function params, then beta last
    discount: Callable
    reference: str

    @property
    def n_params(self) -> int:
        return len(self.params)

    @property
    def param_names(self):
        return [p.name for p in self.params]

    def unpack(self, x):
        return {p.name: p.to_natural(v) for p, v in zip(self.params, x)}

    def p_later(self, theta: dict, amount_ss, delay_ss, amount_ll, delay_ll):
        dparams = [theta[p.name] for p in self.params if p.name != "beta"]
        v_ss = amount_ss * self.discount(delay_ss, *dparams)
        v_ll = amount_ll * self.discount(delay_ll, *dparams)
        z = theta["beta"] * (v_ll - v_ss)
        return _sigmoid(np.clip(z, -50, 50))


MODELS = {
    "exponential": Model("exponential", (K, BETA), exponential, "Samuelson (1937)"),
    "hyperbolic": Model("hyperbolic", (K, BETA), hyperbolic, "Mazur (1987)"),
    "hyperboloid": Model("hyperboloid", (K, S, BETA), hyperboloid, "Green & Myerson (2004)"),
    "quasi_hyperbolic": Model("quasi_hyperbolic", (BQH, DELTA, BETA), quasi_hyperbolic, "Laibson (1997)"),
}


def neg_log_lik(x, model: Model, data: dict) -> float:
    theta = model.unpack(x)
    p = model.p_later(theta, data["amount_sooner"], data["delay_sooner"],
                      data["amount_later"], data["delay_later"])
    p = np.clip(p, 1e-10, 1 - 1e-10)
    c = data["choice"]
    return -float(np.sum(c * np.log(p) + (1 - c) * np.log(1 - p)))

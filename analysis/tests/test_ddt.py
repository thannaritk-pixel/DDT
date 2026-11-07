import numpy as np
import pandas as pd
import pytest

from ddt import (MODELS, adjusting_indifference_points, auc, fit_all_models, fit_model,
                 johnson_bickel, kirby_consistency_k, simulate)
from ddt.recovery import design


def test_discount_functions_at_zero_delay():
    for m in MODELS.values():
        params = {p.name: p.to_natural(np.mean(p.bounds)) for p in m.params}
        dparams = [params[p.name] for p in m.params if p.name != "beta"]
        assert np.allclose(m.discount(np.array([0.0]), *dparams), 1.0)


def test_hyperbolic_recovers_k():
    des = pd.concat([design("grid", rng=i) for i in range(4)], ignore_index=True)
    sim = simulate("hyperbolic", {"k": 0.02, "beta": 0.2}, des, rng=1)
    f = fit_model(sim, "hyperbolic")
    assert abs(np.log(f["k"]) - np.log(0.02)) < 0.5


def test_model_comparison_prefers_generating_model():
    des = pd.concat([design("grid", rng=i) for i in range(6)], ignore_index=True)
    sim = simulate("exponential", {"k": 0.01, "beta": 0.2}, des, rng=2)
    res = fit_all_models(sim, ["exponential", "hyperbolic"])
    assert res.loc[res["bic"].idxmin(), "model"] == "exponential"


def test_kirby_consistency_perfect_responder():
    ks = np.array([0.00016, 0.0004, 0.001, 0.0025, 0.006, 0.016, 0.041, 0.10, 0.25])
    true_k = 0.01
    r = kirby_consistency_k(ks, (ks > true_k).astype(int))
    assert r["consistency"] == 1.0
    assert 0.006 < r["k"] < 0.016


def test_adjusting_replay_and_auc():
    # Always choosing "sooner" drives SS down to LL/2 - LL/4 - ... -> LL/128 after 6 steps.
    df = pd.DataFrame({"delay_later": [30] * 6, "amount_later": [1000] * 6, "choice": [0] * 6})
    ip = adjusting_indifference_points(df)
    assert ip["indiff"].iloc[0] == pytest.approx(1000 / 128)
    assert auc([10, 20], [1.0, 1.0]) == pytest.approx(1.0)
    assert auc([10, 20], [0.0, 0.0]) == pytest.approx(0.25)


def test_johnson_bickel():
    assert not johnson_bickel([1, 7, 30], [0.9, 0.7, 0.4])["jb_nonsystematic"]
    assert johnson_bickel([1, 7, 30], [0.5, 0.8, 0.4])["jb_c1_fail"]
    assert johnson_bickel([1, 7, 30], [0.9, 0.88, 0.85])["jb_c2_fail"]

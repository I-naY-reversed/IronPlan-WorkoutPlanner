"""Shared helpers for fitting the app's priors from public data.

Effects are expressed as log response ratios per week, ln(post/pre) / weeks,
which matches the app model's log-e1RM scale (a weekly gain of 0.01 ≈ 1%).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

RNG = np.random.default_rng(20261020)


def impute_correlation(pre_sd, post_sd, delta_sd) -> float:
    """Median pre-post correlation implied by rows reporting all three SDs."""
    m = pre_sd.notna() & post_sd.notna() & delta_sd.notna() & (pre_sd > 0) & (post_sd > 0)
    r = (pre_sd[m] ** 2 + post_sd[m] ** 2 - delta_sd[m] ** 2) / (2 * pre_sd[m] * post_sd[m])
    r = r[(r > -1) & (r < 1)]
    return float(r.median())


def weekly_lnrr(df: pd.DataFrame, cols: dict[str, str], r_default: float) -> pd.DataFrame:
    """Adds `y` (ln(post/pre)/weeks) and `v` (its sampling variance) to df."""
    pre = df[cols["pre"]].astype(float)
    post = df[cols["post"]].astype(float)
    delta = df[cols["delta"]].astype(float)
    post = post.fillna(pre + delta)
    n = df[cols["n"]].astype(float)
    sd_pre = df[cols["pre_sd"]].astype(float)
    sd_post = df[cols["post_sd"]].astype(float).fillna(sd_pre)
    sd_delta = df[cols["delta_sd"]].astype(float)
    r = df[cols["r"]].astype(float).where(lambda x: (x > -1) & (x < 1)) if cols.get("r") in df else pd.Series(np.nan, index=df.index)
    r = r.fillna(r_default)
    # Delta-method variance of ln(post/pre); prefer a reported change SD.
    v_from_sds = (sd_pre**2 / (n * pre**2)) + (sd_post**2 / (n * post**2)) - 2 * r * sd_pre * sd_post / (n * pre * post)
    v_from_delta = sd_delta**2 / (n * pre**2)
    v = v_from_delta.fillna(v_from_sds)
    weeks = df[cols["weeks"]].astype(float)
    out = df.copy()
    out["y"] = np.log(post / pre) / weeks
    out["v"] = v / weeks**2
    ok = np.isfinite(out["y"]) & np.isfinite(out["v"]) & (out["v"] > 0) & (pre > 0) & (post > 0)
    return out[ok]


def fit_random_effects(model, x, y, v, clusters, p0, bounds, n_iter: int = 20):
    """Weighted nonlinear least squares with an additive between-study variance τ².

    τ² is estimated by iterating a method-of-moments step on the weighted
    residuals (DerSimonian–Laird style), weights 1 / (v + τ²).
    """
    tau2 = float(np.var(y)) * 0.5
    params = np.array(p0, dtype=float)
    for _ in range(n_iter):
        w = 1.0 / (v + tau2)
        res = least_squares(lambda p: (model(p, x) - y) * np.sqrt(w), params, bounds=bounds)
        params = res.x
        w0 = 1.0 / v
        q = float(np.sum(w0 * (model(params, x) - y) ** 2))
        dfree = len(y) - len(params)
        c = float(np.sum(w0) - np.sum(w0**2) / np.sum(w0))
        new_tau2 = max(0.0, (q - dfree) / c)
        if abs(new_tau2 - tau2) < 1e-12:
            break
        tau2 = new_tau2
    return params, tau2


def cluster_bootstrap(fit, df: pd.DataFrame, cluster_col: str, n_boot: int = 400):
    """Refits on studies resampled with replacement; returns an array of parameter vectors."""
    studies = df[cluster_col].unique()
    out = []
    for _ in range(n_boot):
        pick = RNG.choice(studies, size=len(studies), replace=True)
        boot = pd.concat([df[df[cluster_col] == s].assign(_c=f"{s}_{i}") for i, s in enumerate(pick)])
        try:
            out.append(fit(boot))
        except Exception:  # noqa: BLE001 - a degenerate resample is skipped
            continue
    return np.array(out)


def summary(samples: np.ndarray) -> dict[str, float]:
    return {
        "median": float(np.median(samples)),
        "low95": float(np.percentile(samples, 2.5)),
        "high95": float(np.percentile(samples, 97.5)),
    }

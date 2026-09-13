"""Small, explainable IFRS 9 expected-credit-loss calculations.

The module deliberately works on DataFrame copies.  It has no database, API,
model training, or persistent state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_SCENARIOS: dict[str, dict[str, float]] = {
    "Baseline": {"pd_mult": 1.0, "lgd_mult": 1.0, "weight": 0.40},
    "Adverse": {"pd_mult": 1.5, "lgd_mult": 1.15, "weight": 0.40},
    "Upside": {"pd_mult": 0.8, "lgd_mult": 0.95, "weight": 0.20},
}

REQUIRED_COLUMNS = {
    "account_id",
    "report_date",
    "pit_pd_12m",
    "stage",
    "default_flag",
}


@dataclass(frozen=True)
class EngineConfig:
    """Configuration for the transparent IFRS 9 calculation rules."""

    lifetime_years: int = 5
    lgd_default: float = 0.45
    ead_default: float = 10_000.0
    ead_source: str = "global"
    lgd_source: str = "global"
    lgd_feed_mode: str = "weighted"
    lgd_feed_segment: str | None = None
    calibrate_pd: bool = True
    scenarios: dict[str, dict[str, float]] = field(
        default_factory=lambda: {name: values.copy() for name, values in DEFAULT_SCENARIOS.items()}
    )


def _numeric(series: pd.Series) -> pd.Series:
    """Return a numeric copy of a Series, treating unparseable values as missing."""
    return pd.to_numeric(series, errors="coerce")


def _prepared(df: pd.DataFrame) -> pd.DataFrame:
    """Make a calculation-safe copy while retaining all optional borrower attributes."""
    prepared = df.copy()
    for column in ("account_id", "pit_pd_12m", "stage", "default_flag", "dpd", "ead", "lgd", "balance"):
        if column in prepared:
            prepared[column] = _numeric(prepared[column])
    if "report_date" in prepared:
        prepared["report_date"] = pd.to_datetime(prepared["report_date"], errors="coerce")
    return prepared


def validate(df: pd.DataFrame) -> tuple[bool, list[str]]:
    """Validate input fields after coercion; PD must satisfy 0 <= pit_pd_12m <= 1."""
    errors: list[str] = []
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        errors.append(f"Missing required columns: {', '.join(missing)}")
        return False, errors

    prepared = _prepared(df)
    for column in ("account_id", "pit_pd_12m", "stage", "default_flag"):
        if prepared[column].isna().any():
            errors.append(f"{column} contains missing or non-numeric values")
    if prepared["report_date"].isna().any():
        errors.append("report_date contains missing or invalid dates")
    if not prepared["pit_pd_12m"].dropna().between(0, 1).all():
        errors.append("pit_pd_12m must be in [0, 1]")
    if not prepared["stage"].dropna().isin([1, 2, 3]).all():
        errors.append("stage must be one of 1, 2, or 3")
    if not prepared["default_flag"].dropna().isin([0, 1]).all():
        errors.append("default_flag must be 0 or 1")
    if not prepared["account_id"].dropna().mod(1).eq(0).all():
        errors.append("account_id must contain whole numbers")
    return not errors, errors


def resolve_ead(df: pd.DataFrame, cfg: EngineConfig) -> pd.Series:
    """Resolve EAD as selected input column or the global default, with missing values filled."""
    source = {"column_ead": "ead", "column_balance": "balance"}.get(cfg.ead_source)
    if source is not None and source in df:
        ead = _numeric(df[source]).fillna(cfg.ead_default)
    else:
        ead = pd.Series(cfg.ead_default, index=df.index, dtype=float)
    # Formula: EAD_used = max(selected EAD, 0).
    return ead.clip(lower=0.0).astype(float)


def resolve_lgd(df: pd.DataFrame, cfg: EngineConfig) -> pd.Series:
    """Resolve LGD as the selected input column or global default, with missing values filled."""
    if cfg.lgd_source == "column_lgd" and "lgd" in df:
        lgd = _numeric(df["lgd"]).fillna(cfg.lgd_default)
    else:
        lgd = pd.Series(cfg.lgd_default, index=df.index, dtype=float)
    # Formula: LGD_used = min(max(selected LGD, 0), 1).
    return lgd.clip(lower=0.0, upper=1.0).astype(float)


def calibrate_pd(df: pd.DataFrame, cfg: EngineConfig) -> tuple[pd.Series, float]:
    """Calibrate PD using mult = mean(default_flag) / max(mean(PD_12m), 1e-9)."""
    pit_pd = _numeric(df["pit_pd_12m"]).fillna(0.0).clip(lower=0.0, upper=1.0)
    if cfg.calibrate_pd:
        # Formula: calibration_mult = observed default rate / mean raw PD.
        mult = float(_numeric(df["default_flag"]).mean() / max(float(pit_pd.mean()), 1e-9))
    else:
        mult = 1.0
    # Formula: PD_cal = clip(PD_12m * calibration_mult, 1e-6, 0.9999).
    return (pit_pd * mult).clip(lower=1e-6, upper=0.9999), mult


def lifetime_pd(pd_cal: pd.Series | float, cfg: EngineConfig) -> pd.Series | float:
    """Convert annual PD into cumulative lifetime PD: 1 - (1 - PD_cal)^lifetime_years."""
    # Formula: PD_lifetime = 1 - (1 - PD_cal) ** lifetime_years.
    return 1.0 - (1.0 - pd_cal) ** cfg.lifetime_years


def _stage_rule(df: pd.DataFrame) -> pd.Series:
    """Apply the simple DPD rule, or retain the supplied stage when DPD is unavailable."""
    file_stage = _numeric(df["stage"]).fillna(1).astype(int)
    if "dpd" not in df:
        return file_stage
    dpd = _numeric(df["dpd"])
    default_flag = _numeric(df["default_flag"]).fillna(0)
    # Formula: rule stage = 3 for default/90+ DPD, 2 for 30-89 DPD, otherwise 1.
    return pd.Series(
        np.select(
            [default_flag.eq(1) | dpd.ge(90), dpd.ge(30) & dpd.lt(90)],
            [3, 2],
            default=1,
        ),
        index=df.index,
        dtype=int,
    )


def compute_ecl(df: pd.DataFrame, cfg: EngineConfig | None = None) -> pd.DataFrame:
    """Compute ECL with ECL = PD_used * LGD_used * EAD_used for every account."""
    cfg = cfg or EngineConfig()
    prepared = _prepared(df)
    pd_cal, calibration_mult = calibrate_pd(prepared, cfg)
    pd_life = lifetime_pd(pd_cal, cfg)
    stage = prepared["stage"].astype(int)
    # Formula: Stage 1 uses 12m PD, Stage 2 lifetime PD, Stage 3 PD = 1.
    pd_used = pd.Series(np.select([stage.eq(1), stage.eq(2)], [pd_cal, pd_life], default=1.0), index=prepared.index)
    prepared["pd_cal"] = pd_cal
    prepared["pd_life"] = pd_life
    prepared["pd_used"] = pd_used.astype(float)
    prepared["ead_used"] = resolve_ead(prepared, cfg)
    prepared["lgd_used"] = resolve_lgd(prepared, cfg)
    # Formula: ECL = PD_used * LGD_used * EAD_used.
    prepared["ecl"] = prepared["pd_used"] * prepared["lgd_used"] * prepared["ead_used"]
    prepared["stage_rule"] = _stage_rule(prepared)
    prepared.attrs["pd_calibration_mult"] = calibration_mult
    return prepared


def portfolio_summary(df_ecl: pd.DataFrame) -> dict[str, Any]:
    """Summarise portfolio ECL, where provision_pct = total_ECL / total_EAD."""
    data = df_ecl.copy()
    total_ecl = float(_numeric(data["ecl"]).fillna(0.0).sum())
    total_ead = float(_numeric(data["ead_used"]).fillna(0.0).sum())
    stage_rows: list[dict[str, float | int]] = []
    for stage in (1, 2, 3):
        stage_data = data[_numeric(data["stage"]).eq(stage)]
        count = len(stage_data)
        stage_rows.append(
            {
                "stage": stage,
                "count": count,
                "share": count / len(data) if len(data) else 0.0,
                "ecl": float(_numeric(stage_data["ecl"]).fillna(0.0).sum()),
            }
        )
    stage_mix = pd.DataFrame(stage_rows)
    if "region" in data:
        ecl_by_region = (
            data.assign(region=data["region"].fillna("Unknown"))
            .groupby("region", dropna=False, as_index=False)["ecl"]
            .sum()
            .sort_values("ecl", ascending=False, ignore_index=True)
        )
    else:
        ecl_by_region = pd.DataFrame(columns=["region", "ecl"])

    dates = pd.to_datetime(data["report_date"], errors="coerce")
    monthly_rows: list[dict[str, Any]] = []
    for month, month_data in data.assign(report_month=dates.dt.to_period("M").astype(str)).groupby("report_month", dropna=True):
        row: dict[str, Any] = {"report_month": month, "ecl": float(month_data["ecl"].sum())}
        for stage in (1, 2, 3):
            row[f"stage_{stage}_share"] = float(_numeric(month_data["stage"]).eq(stage).mean())
        monthly_rows.append(row)
    monthly = pd.DataFrame(monthly_rows).sort_values("report_month", ignore_index=True) if monthly_rows else pd.DataFrame()
    agreement = float(_numeric(data["stage"]).eq(_numeric(data["stage_rule"])).mean() * 100.0)
    return {
        "total_ecl": total_ecl,
        "total_ead": total_ead,
        # Formula: provision_pct = total_ecl / total_ead.
        "provision_pct": total_ecl / total_ead if total_ead else 0.0,
        "avg_pd": float(_numeric(data["pd_used"]).mean()),
        "n": int(len(data)),
        "stage_mix": stage_mix,
        "ecl_by_region": ecl_by_region,
        "monthly": monthly,
        "stage_rule_agreement_pct": agreement,
    }


def run_scenarios(df: pd.DataFrame, cfg: EngineConfig | None = None) -> dict[str, Any]:
    """Recompute ECL by scenario: ECL_s = clip(PD_used*pd_mult)*clip(LGD*lgd_mult)*EAD."""
    cfg = cfg or EngineConfig()
    data = df if {"pd_used", "ead_used", "lgd_used"}.issubset(df.columns) else compute_ecl(df, cfg)
    scenario_defs = cfg.scenarios
    raw_weights = {name: max(float(values.get("weight", 0.0)), 0.0) for name, values in scenario_defs.items()}
    weight_total = sum(raw_weights.values())
    if not scenario_defs or weight_total <= 0.0:
        raise ValueError("scenarios must contain positive total weight")
    weights = {name: value / weight_total for name, value in raw_weights.items()}
    scenario_ecl = pd.DataFrame(index=data.index)
    for name, values in scenario_defs.items():
        # Formula: stressed PD = min(PD_used * scenario pd_mult, 0.9999).
        stressed_pd = _numeric(data["pd_used"]).clip(lower=0.0).mul(float(values.get("pd_mult", 1.0))).clip(upper=0.9999)
        # Formula: stressed LGD = min(max(LGD_used * scenario lgd_mult, 0), 1).
        stressed_lgd = _numeric(data["lgd_used"]).mul(float(values.get("lgd_mult", 1.0))).clip(lower=0.0, upper=1.0)
        # Formula: scenario ECL = stressed PD * stressed LGD * EAD_used.
        scenario_ecl[name] = stressed_pd * stressed_lgd * _numeric(data["ead_used"]).clip(lower=0.0)
    # Formula: weighted ECL = sum(normalised scenario weight * scenario ECL).
    weighted_ecl = sum(scenario_ecl[name] * weights[name] for name in scenario_ecl.columns)
    result: dict[str, Any] = {"scenario_ecl": scenario_ecl, "weighted_ecl": weighted_ecl, "weights": weights}
    result.update({name: scenario_ecl[name] for name in scenario_ecl.columns})
    return result


def sensitivity(
    df: pd.DataFrame,
    cfg: EngineConfig | None = None,
    shocks: tuple[float, ...] = (-0.2, -0.1, 0.1, 0.2),
) -> dict[str, Any]:
    """Measure one-factor ECL changes, where one selected input becomes input * (1 + shock)."""
    cfg = cfg or EngineConfig()
    baseline_data = compute_ecl(df, cfg)
    # Formula: baseline ECL = sum(PD_used * LGD_used * EAD_used) across all loans.
    baseline = float(_numeric(baseline_data["ecl"]).fillna(0.0).sum())
    factors: dict[str, list[dict[str, float]]] = {}
    for factor in ("PD", "LGD", "EAD"):
        results: list[dict[str, float]] = []
        for shock in shocks:
            multiplier = 1.0 + float(shock)
            pd_used = _numeric(baseline_data["pd_used"]).clip(lower=0.0, upper=0.9999)
            lgd_used = _numeric(baseline_data["lgd_used"]).clip(lower=0.0, upper=1.0)
            ead_used = _numeric(baseline_data["ead_used"]).clip(lower=0.0)
            if factor == "PD":
                # Formula: shocked PD = clip(PD_used * (1 + shock), 0, 0.9999).
                pd_used = pd_used.mul(multiplier).clip(lower=0.0, upper=0.9999)
            elif factor == "LGD":
                # Formula: shocked LGD = clip(LGD_used * (1 + shock), 0, 1).
                lgd_used = lgd_used.mul(multiplier).clip(lower=0.0, upper=1.0)
            else:
                # Formula: shocked EAD = max(EAD_used * (1 + shock), 0).
                ead_used = ead_used.mul(multiplier).clip(lower=0.0)
            # Formula: shocked portfolio ECL = sum(shocked PD * shocked LGD * shocked EAD).
            results.append({"shock": float(shock), "ecl": float((pd_used * lgd_used * ead_used).sum())})
        factors[factor] = results
    return {
        "baseline": baseline,
        "factors": factors,
        "note": "Macro sensitivity is not shown because PD is calibrated from observed defaults, not modelled as a macro-driven factor.",
    }


def whatif_borrower(
    df: pd.DataFrame,
    cfg: EngineConfig | None,
    account_id: int,
    overrides: dict[str, Any],
) -> dict[str, Any]:
    """Recalculate one borrower after allowed overrides using portfolio PD calibration and the DPD stage rule."""
    cfg = cfg or EngineConfig()
    if not isinstance(overrides, dict):
        raise ValueError("overrides must be a JSON object")
    matches = _prepared(df)[_numeric(df["account_id"]).eq(account_id)]
    if matches.empty:
        raise KeyError(f"account_id {account_id} was not found")
    allowed = {"dpd", "internal_score", "pit_pd_12m"}
    unknown = sorted(set(overrides) - allowed)
    if unknown:
        raise ValueError(f"Unsupported overrides: {', '.join(unknown)}")
    row_before = matches.iloc[[0]].copy()
    row_after = row_before.copy()
    for column, value in overrides.items():
        if column not in row_after:
            raise ValueError(f"{column} is not available for this borrower")
        numeric_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
        if pd.isna(numeric_value):
            raise ValueError(f"{column} must be numeric")
        if column == "pit_pd_12m" and not 0.0 <= float(numeric_value) <= 1.0:
            raise ValueError("pit_pd_12m must be in [0, 1]")
        row_after.loc[row_after.index[0], column] = float(numeric_value)

    _, calibration_mult = calibrate_pd(_prepared(df), cfg)

    def calculate_row(row: pd.DataFrame) -> dict[str, float | int]:
        prepared = _prepared(row)
        stage_rule = int(_stage_rule(prepared).iloc[0])
        # Formula: PD_cal = clip(raw borrower PD * portfolio calibration multiplier, 1e-6, 0.9999).
        pd_cal = float(np.clip(float(prepared["pit_pd_12m"].iloc[0]) * calibration_mult, 1e-6, 0.9999))
        pd_life = float(lifetime_pd(pd_cal, cfg))
        # Formula: PD_used = 12m PD for Stage 1, lifetime PD for Stage 2, and 1.0 for Stage 3.
        pd_used = pd_cal if stage_rule == 1 else pd_life if stage_rule == 2 else 1.0
        ead_used = float(resolve_ead(prepared, cfg).iloc[0])
        lgd_used = float(resolve_lgd(prepared, cfg).iloc[0])
        # Formula: borrower ECL = PD_used * LGD_used * EAD_used.
        return {"stage": stage_rule, "pd_used": pd_used, "lgd_used": lgd_used, "ead_used": ead_used, "ecl": pd_used * lgd_used * ead_used}

    before = calculate_row(row_before)
    after = calculate_row(row_after)
    if "dpd" in overrides and before["stage"] != after["stage"]:
        old_dpd = float(row_before["dpd"].iloc[0])
        new_dpd = float(row_after["dpd"].iloc[0])
        direction = "raised" if new_dpd > old_dpd else "lowered"
        reason = f"DPD {direction} from {old_dpd:g} to {new_dpd:g} crosses a stage threshold, so the loan moves to Stage {after['stage']} and its ECL changes from {before['ecl']:.2f} to {after['ecl']:.2f}."
    elif "dpd" in overrides:
        reason = f"DPD changes from {float(row_before['dpd'].iloc[0]):g} to {float(row_after['dpd'].iloc[0]):g}, but it stays within Stage {after['stage']}, so the stage-adjusted PD and ECL remain {after['ecl']:.2f}."
    elif "pit_pd_12m" in overrides:
        reason = f"12-month PD changes from {float(row_before['pit_pd_12m'].iloc[0]):.4f} to {float(row_after['pit_pd_12m'].iloc[0]):.4f}, so the stage-adjusted PD and ECL change from {before['ecl']:.2f} to {after['ecl']:.2f}."
    elif "internal_score" in overrides:
        reason = f"Internal score changes from {float(row_before['internal_score'].iloc[0]):g} to {float(row_after['internal_score'].iloc[0]):g}. It is borrower context only in this transparent rule set, so Stage {after['stage']} and ECL remain {after['ecl']:.2f}."
    else:
        reason = "No calculation override was supplied, so the borrower result is unchanged."
    return {"before": before, "after": after, "reason": reason}


def watchlist(df: pd.DataFrame, cfg: EngineConfig | None = None, dpd_low: int = 25) -> dict[str, Any]:
    """List Stage 1-by-rule accounts just below 30 DPD and their lifetime-ECL increment."""
    if "dpd" not in df:
        return {"available": False}
    cfg = cfg or EngineConfig()
    data = compute_ecl(df, cfg)
    dpd = _numeric(data["dpd"])
    candidates = data[_numeric(data["stage_rule"]).eq(1) & dpd.between(dpd_low, 29, inclusive="both")].copy()
    # Formula: current ECL = 12m PD_cal * LGD_used * EAD_used for near-threshold Stage 1 accounts.
    candidates["current_ecl"] = candidates["pd_cal"] * candidates["lgd_used"] * candidates["ead_used"]
    # Formula: potential ECL = lifetime PD * LGD_used * EAD_used, where lifetime PD = 1 - (1 - PD_cal)^N.
    candidates["potential_ecl"] = candidates["pd_life"] * candidates["lgd_used"] * candidates["ead_used"]
    # Formula: ECL at risk = potential Stage 2 ECL - current Stage 1 ECL.
    candidates["ecl_at_risk"] = (candidates["potential_ecl"] - candidates["current_ecl"]).clip(lower=0.0)
    ordered = candidates.sort_values("ecl_at_risk", ascending=False).head(50)
    rows = [
        {
            "account_id": int(row.account_id),
            "dpd": float(row.dpd),
            "current_ecl": float(row.current_ecl),
            "potential_ecl": float(row.potential_ecl),
            "ecl_at_risk": float(row.ecl_at_risk),
        }
        for row in ordered.itertuples()
    ]
    return {
        "available": True,
        "n": int(len(candidates)),
        "total_ecl_at_risk": float(candidates["ecl_at_risk"].sum()),
        "rows": rows,
    }


def data_quality(df: pd.DataFrame) -> dict[str, Any]:
    """Report non-blocking portfolio data checks with counts and up to five affected account IDs."""
    def sample_ids(mask: pd.Series) -> list[int | str]:
        if "account_id" not in df:
            return []
        values = df.loc[mask, "account_id"].head(5).tolist()
        return [int(value) if isinstance(value, (int, np.integer)) or (isinstance(value, float) and value.is_integer()) else str(value) for value in values]

    checks: list[dict[str, Any]] = []
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    checks.append({"check": "Missing required columns", "severity": "error", "count": len(missing), "sample_ids": missing[:5]})
    if missing:
        return {"status": "red", "checks": checks}

    pd_values = _numeric(df["pit_pd_12m"])
    pd_invalid = pd_values.notna() & ~pd_values.between(0.0, 1.0)
    checks.append({"check": "PD outside [0, 1]", "severity": "error", "count": int(pd_invalid.sum()), "sample_ids": sample_ids(pd_invalid)})
    stage_values = _numeric(df["stage"])
    stage_invalid = ~stage_values.isin([1, 2, 3])
    checks.append({"check": "Stage outside {1, 2, 3}", "severity": "error", "count": int(stage_invalid.sum()), "sample_ids": sample_ids(stage_invalid)})
    ead_column = "ead" if "ead" in df else "balance" if "balance" in df else None
    if ead_column is None:
        ead_invalid = pd.Series(False, index=df.index)
    else:
        ead_invalid = _numeric(df[ead_column]).le(0).fillna(False)
    checks.append({"check": "EAD is zero or negative", "severity": "warn", "count": int(ead_invalid.sum()), "sample_ids": sample_ids(ead_invalid)})
    if "dpd" in df:
        dpd_invalid = _numeric(df["dpd"]).lt(0).fillna(False)
    else:
        dpd_invalid = pd.Series(False, index=df.index)
    checks.append({"check": "DPD is negative", "severity": "warn", "count": int(dpd_invalid.sum()), "sample_ids": sample_ids(dpd_invalid)})
    account_ids = df["account_id"]
    duplicates = account_ids.duplicated(keep=False) & account_ids.notna()
    checks.append({"check": "Duplicate account ID", "severity": "warn", "count": int(duplicates.sum()), "sample_ids": sample_ids(duplicates)})
    if any(item["severity"] == "error" and item["count"] > 0 for item in checks):
        status = "red"
    elif any(item["severity"] == "warn" and item["count"] > 0 for item in checks):
        status = "amber"
    else:
        status = "green"
    return {"status": status, "checks": checks}


def borrower_view(df_ecl: pd.DataFrame, account_id: int) -> dict[str, Any]:
    """Return one account's ECL inputs, where ECL = PD_used * LGD_used * EAD_used."""
    matches = df_ecl[_numeric(df_ecl["account_id"]).eq(account_id)]
    if matches.empty:
        raise KeyError(f"account_id {account_id} was not found")
    row = matches.iloc[0]
    identity = {key: row[key] for key in ("account_id", "report_date", "region") if key in row.index}
    context: list[str] = []
    if "dpd" in row.index and pd.notna(row["dpd"]):
        dpd = float(row["dpd"])
        if dpd >= 90:
            context.append(f"{dpd:g} days past due, at or above the 90-day default line")
        elif dpd >= 30:
            context.append(f"{dpd:g} days past due, above the 30-day watch line")
        else:
            context.append(f"{dpd:g} days past due, below the 30-day watch line")
    if "credit_utilization" in row.index and pd.notna(row["credit_utilization"]):
        utilisation = float(row["credit_utilization"])
        context.append(f"credit utilisation {utilisation:.2f}, {'high' if utilisation >= 1 else 'within the credit limit'}")
    for column, label in (("age", "age"), ("employment_status", "employment status"), ("marital_status", "marital status"), ("dependents", "dependents"), ("internal_score", "internal score"), ("macro_gdp_growth", "GDP growth"), ("macro_unemployment", "unemployment"), ("macro_interest_rate", "interest rate")):
        if column in row.index and pd.notna(row[column]):
            context.append(f"{label}: {row[column]}")
    return {
        "identity": identity,
        "stage": int(row["stage"]),
        "stage_rule": int(row["stage_rule"]),
        "pd_12m": float(row["pd_cal"]),
        "pd_lifetime": float(row["pd_life"]),
        "lgd_used": float(row["lgd_used"]),
        "ead_used": float(row["ead_used"]),
        "ecl": float(row["ecl"]),
        "factor_context": context,
        "whatif_inputs": {
            column: float(row[column])
            for column in ("dpd", "internal_score", "pit_pd_12m")
            if column in row.index and pd.notna(row[column])
        },
    }

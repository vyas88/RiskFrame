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
    }

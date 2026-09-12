"""Small, explainable LGD portfolio summaries with no model fitting or storage."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


REQUIRED_COLUMNS = {"ACCOUNT_ID", "EXPOSURE_AT_DEFAULT", "LGD_OBS"}
SEGMENT_COLUMNS = ("COLLATERAL_TYPE", "SENIORITY", "SECTOR", "REGION", "ECONOMIC_SEGMENT")


def _numeric(series: pd.Series) -> pd.Series:
    """Return a numeric copy of a Series, treating unparseable values as missing."""
    return pd.to_numeric(series, errors="coerce")

def _prepared(df: pd.DataFrame) -> pd.DataFrame:
    """Make a calculation-safe copy and clip observed LGD to its probability range."""
    data = df.copy()
    numeric_columns = {
        "ACCOUNT_ID", "EXPOSURE_AT_DEFAULT", "LGD_OBS", "RECOVERY_RATE", "LGD_MODEL_PRED",
        "COLLATERAL_VALUE", "LTV_RATIO", "GUARANTEE_FLAG", "DAYS_PAST_DUE", "INTEREST_RATE",
        "RECOVERY_TIME_MONTHS", "DEFAULT_FLAG",
    }
    for column in numeric_columns.intersection(data.columns):
        data[column] = _numeric(data[column])
    if "LGD_OBS" in data:
        # Formula: LGD_obs = min(max(raw LGD_obs, 0), 1).
        data["LGD_OBS"] = data["LGD_OBS"].clip(lower=0.0, upper=1.0)
    if "EXPOSURE_AT_DEFAULT" in data:
        data["EXPOSURE_AT_DEFAULT"] = data["EXPOSURE_AT_DEFAULT"].clip(lower=0.0)
    return data


def validate(df: pd.DataFrame) -> tuple[bool, list[str]]:
    """Validate required fields after numeric coercion and check recovery plus LGD is about one."""
    errors: list[str] = []
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        errors.append(f"Missing required columns: {', '.join(missing)}")
        return False, errors
    data = _prepared(df)
    for column in REQUIRED_COLUMNS:
        if data[column].isna().any():
            errors.append(f"{column} contains missing or invalid values")
    if not data["ACCOUNT_ID"].dropna().mod(1).eq(0).all():
        errors.append("ACCOUNT_ID must contain whole numbers")
    if "RECOVERY_RATE" in data:
        sums_to_one = np.isclose(data["RECOVERY_RATE"] + data["LGD_OBS"], 1.0, atol=0.05, equal_nan=True)
        if not bool(np.all(sums_to_one)):
            errors.append("RECOVERY_RATE and LGD_OBS should sum to approximately 1")
    return not errors, errors


def _weighted_lgd(data: pd.DataFrame) -> float:
    """Compute weighted LGD as sum(EAD * LGD) / sum(EAD)."""
    total_ead = float(data["EXPOSURE_AT_DEFAULT"].sum())
    # Formula: EAD-weighted LGD = sum(EAD * LGD_obs) / sum(EAD).
    return float((data["EXPOSURE_AT_DEFAULT"] * data["LGD_OBS"]).sum() / total_ead) if total_ead else 0.0


def portfolio_lgd(df: pd.DataFrame) -> dict[str, float | int]:
    """Summarise LGD, with mean recovery = 1 - mean LGD."""
    data = _prepared(df)
    mean_lgd = float(data["LGD_OBS"].mean()) if len(data) else 0.0
    return {
        "n": int(len(data)),
        "total_ead": float(data["EXPOSURE_AT_DEFAULT"].sum()),
        "mean_lgd": mean_lgd,
        "ead_weighted_lgd": _weighted_lgd(data),
        # Formula: mean_recovery = 1 - mean_lgd.
        "mean_recovery": 1.0 - mean_lgd,
    }


def lgd_by_segment(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """Aggregate segment LGD, where weighted LGD = sum(EAD*LGD)/sum(EAD) in each segment."""
    if col not in df:
        raise KeyError(f"Segment column {col} is not present")
    data = _prepared(df)
    values = data[col].fillna("None" if col == "COLLATERAL_TYPE" else "Unknown")
    rows: list[dict[str, Any]] = []
    for value, group in data.assign(_segment=values).groupby("_segment", dropna=False):
        rows.append(
            {
                col: value,
                "count": int(len(group)),
                "total_ead": float(group["EXPOSURE_AT_DEFAULT"].sum()),
                "mean_lgd": float(group["LGD_OBS"].mean()),
                "ead_weighted_lgd": _weighted_lgd(group),
            }
        )
    return pd.DataFrame(rows).sort_values("ead_weighted_lgd", ascending=False, ignore_index=True)


def ltv_effect(df: pd.DataFrame) -> pd.DataFrame | None:
    """Bucket LTV into <=1, 1-2, 2-3, >3 and calculate mean LGD per bucket."""
    if "LTV_RATIO" not in df:
        return None
    data = _prepared(df).dropna(subset=["LTV_RATIO"])
    # Formula: LTV bucket follows the interval containing LTV_RATIO.
    buckets = pd.cut(data["LTV_RATIO"], [-np.inf, 1, 2, 3, np.inf], labels=["<=1", "1-2", "2-3", ">3"], include_lowest=True)
    return (
        data.assign(ltv_bucket=buckets)
        .groupby("ltv_bucket", observed=False)
        .agg(mean_lgd=("LGD_OBS", "mean"), count=("LGD_OBS", "size"))
        .reset_index()
    )


def collateral_effect(df: pd.DataFrame) -> dict[str, dict[str, float]] | None:
    """Compare mean LGD by collateral and guarantee status, where collateral means value greater than zero."""
    data = _prepared(df)
    result: dict[str, dict[str, float]] = {}
    if "COLLATERAL_VALUE" in data:
        # Formula: has_collateral = COLLATERAL_VALUE > 0.
        has_collateral = data["COLLATERAL_VALUE"].fillna(0).gt(0)
        result["collateral"] = {
            "has_collateral": float(data.loc[has_collateral, "LGD_OBS"].mean()),
            "none": float(data.loc[~has_collateral, "LGD_OBS"].mean()),
        }
    if "GUARANTEE_FLAG" in data:
        result["guarantee"] = {
            "flag_0": float(data.loc[data["GUARANTEE_FLAG"].eq(0), "LGD_OBS"].mean()),
            "flag_1": float(data.loc[data["GUARANTEE_FLAG"].eq(1), "LGD_OBS"].mean()),
        }
    return result or None


def model_accuracy(df: pd.DataFrame) -> dict[str, Any] | None:
    """Measure prediction quality: MAE, RMSE, bias = mean(pred-obs), and correlation."""
    if "LGD_MODEL_PRED" not in df:
        return None
    data = _prepared(df).dropna(subset=["LGD_MODEL_PRED", "LGD_OBS"])
    if data.empty:
        return None
    pred = data["LGD_MODEL_PRED"].clip(lower=0.0, upper=1.0)
    obs = data["LGD_OBS"]
    errors = pred - obs
    points = min(10, len(data))
    sample = data.iloc[np.linspace(0, len(data) - 1, points, dtype=int)]
    sample_pred = sample["LGD_MODEL_PRED"].clip(lower=0.0, upper=1.0)
    return {
        # Formula: MAE = mean(abs(pred - obs)).
        "mae": float(np.abs(errors).mean()),
        # Formula: RMSE = sqrt(mean((pred - obs)^2)).
        "rmse": float(np.sqrt(np.square(errors).mean())),
        # Formula: bias = mean(pred - obs).
        "bias": float(errors.mean()),
        "corr": float(pred.corr(obs)),
        "scatter_obs": sample["LGD_OBS"].astype(float).tolist(),
        "scatter_pred": sample_pred.astype(float).tolist(),
    }


def downturn_lgd(df: pd.DataFrame, uplift: float = 0.10) -> dict[str, float]:
    """Stress weighted LGD with stressed = clip(weighted_LGD * (1 + uplift), 0, 1)."""
    headline = float(portfolio_lgd(df)["ead_weighted_lgd"])
    # Formula: stressed weighted LGD = clip(weighted LGD * (1 + uplift), 0, 1).
    return {"uplift": float(uplift), "stressed_weighted_lgd": float(np.clip(headline * (1.0 + uplift), 0.0, 1.0))}


def lgd_for_ecl(df: pd.DataFrame, mode: str = "weighted", segment: Any = None) -> float:
    """Return overall or selected-segment LGD; weighted mode uses sum(EAD*LGD)/sum(EAD)."""
    if mode not in {"weighted", "mean"}:
        raise ValueError("mode must be 'weighted' or 'mean'")
    data = _prepared(df)
    if segment is not None:
        if isinstance(segment, dict) and len(segment) == 1:
            column, value = next(iter(segment.items()))
        elif isinstance(segment, tuple) and len(segment) == 2:
            column, value = segment
        elif isinstance(segment, str) and "=" in segment:
            column, value = segment.split("=", 1)
        else:
            matches = [(column, segment) for column in SEGMENT_COLUMNS if column in data and data[column].eq(segment).any()]
            if len(matches) != 1:
                raise ValueError("segment must identify one segment, for example ('REGION', 'South')")
            column, value = matches[0]
        if column not in data:
            raise KeyError(f"Segment column {column} is not present")
        data = data[data[column].eq(value)]
        if data.empty:
            raise KeyError(f"Segment {column}={value!r} was not found")
    # Formula: ECL LGD is EAD-weighted LGD, or mean LGD when explicitly requested.
    return _weighted_lgd(data) if mode == "weighted" else float(data["LGD_OBS"].mean())

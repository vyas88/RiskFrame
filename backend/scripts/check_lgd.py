"""Run a compact, local smoke check for the LGD analysis engine."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.lgd_engine import (  # noqa: E402
    SEGMENT_COLUMNS,
    collateral_effect,
    downturn_lgd,
    lgd_by_segment,
    lgd_for_ecl,
    ltv_effect,
    model_accuracy,
    portfolio_lgd,
    validate,
)


def main() -> None:
    csv_path = BACKEND_ROOT / "data" / "LGD_Model_Data.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Expected LGD model data at {csv_path}")
    source = pd.read_csv(csv_path)
    ok, errors = validate(source)
    if not ok:
        raise ValueError("Invalid LGD model data: " + "; ".join(errors))
    summary = portfolio_lgd(source)
    segments = {column: lgd_by_segment(source, column) for column in SEGMENT_COLUMNS if column in source}
    ltv = ltv_effect(source)
    collateral = collateral_effect(source)
    accuracy = model_accuracy(source)
    stressed = downturn_lgd(source)
    ecl_lgd = lgd_for_ecl(source)

    assert 0.0 <= float(summary["mean_lgd"]) <= 1.0, "mean LGD must be in [0, 1]"
    assert 0.0 <= float(summary["ead_weighted_lgd"]) <= 1.0, "weighted LGD must be in [0, 1]"
    for column, table in segments.items():
        assert np.isclose(float(table["total_ead"].sum()), float(summary["total_ead"])), f"{column} EAD must reconcile"

    print(f"accounts={summary['n']} weighted_lgd={summary['ead_weighted_lgd']:.4f} mean_lgd={summary['mean_lgd']:.4f}")
    print(f"segments={', '.join(segments) or 'none'} ltv={'yes' if ltv is not None else 'no'} collateral={'yes' if collateral else 'no'}")
    print(f"model_accuracy={'yes' if accuracy else 'no'} stressed_lgd={stressed['stressed_weighted_lgd']:.4f} ecl_lgd={ecl_lgd:.4f}")


if __name__ == "__main__":
    main()

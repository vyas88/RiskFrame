"""Run a compact, local smoke check for the IFRS 9 calculation engine."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.ifrs9_engine import (  # noqa: E402
    EngineConfig,
    borrower_view,
    compute_ecl,
    portfolio_summary,
    run_scenarios,
    validate,
)


def main() -> None:
    csv_path = BACKEND_ROOT / "data" / "sample_portfolio.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Expected sample portfolio at {csv_path}")
    source = pd.read_csv(csv_path)
    ok, errors = validate(source)
    if not ok:
        raise ValueError("Invalid sample portfolio: " + "; ".join(errors))
    ecl = compute_ecl(source, EngineConfig())
    summary = portfolio_summary(ecl)
    scenarios = run_scenarios(ecl)
    account_id = int(ecl.iloc[0]["account_id"])
    borrower = borrower_view(ecl, account_id)

    stage_share = float(summary["stage_mix"]["share"].sum())
    scenario_weight = float(sum(scenarios["weights"].values()))
    assert np.isclose(stage_share, 1.0), "stage shares must sum to 1"
    assert np.isclose(scenario_weight, 1.0), "scenario weights must sum to 1"
    assert bool((ecl["ecl"] >= 0).all()), "all ECL values must be non-negative"
    assert 0.0 <= float(summary["provision_pct"]) <= 1.0, "provision percentage must be in [0, 1]"

    print(f"accounts={summary['n']} total_ecl={summary['total_ecl']:.2f} provision_pct={summary['provision_pct']:.4%}")
    print("stage_shares=" + ", ".join(f"S{row.stage}:{row.share:.1%}" for row in summary["stage_mix"].itertuples()))
    print("scenario_weights=" + ", ".join(f"{name}:{weight:.1%}" for name, weight in scenarios["weights"].items()))
    print(f"borrower={account_id} stage={borrower['stage']} ecl={borrower['ecl']:.2f}")


if __name__ == "__main__":
    main()

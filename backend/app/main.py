"""Stateless FastAPI endpoints for request-scoped RiskFrame analysis."""

from __future__ import annotations

from dataclasses import asdict, fields, replace
from pathlib import Path
from typing import Any, Optional, Union

import numpy as np
import pandas as pd
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import Response
from jinja2 import Template

from . import ifrs9_engine, lgd_engine


SAMPLE_DIR = Path(__file__).resolve().parent / "data"
PORTFOLIO_SAMPLE = SAMPLE_DIR / "sample_portfolio.csv"
LGD_SAMPLE = SAMPLE_DIR / "LGD_Model_Data.csv"
app = FastAPI(title="RiskFrame API")


def _fail(message: str, status_code: int = 400) -> None:
    raise HTTPException(status_code=status_code, detail=message)


def _jsonable(value: Any) -> Any:
    """Convert pandas and numpy objects to JSON-safe values for one response."""
    if isinstance(value, pd.DataFrame):
        return [_jsonable(row) for row in value.replace({np.nan: None}).to_dict(orient="records")]
    if isinstance(value, pd.Series):
        return [_jsonable(item) for item in value.tolist()]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (pd.Timestamp, np.datetime64)):
        return str(value)
    if isinstance(value, np.generic):
        return value.item()
    if value is None or (not isinstance(value, (str, bytes, bool)) and pd.isna(value)):
        return None
    return value


def _validate_portfolio(frame: pd.DataFrame) -> pd.DataFrame:
    ok, errors = ifrs9_engine.validate(frame)
    if not ok:
        _fail("Invalid portfolio rows: " + "; ".join(errors))
    return frame


def _validate_lgd(frame: pd.DataFrame) -> pd.DataFrame:
    ok, errors = lgd_engine.validate(frame)
    if not ok:
        _fail("Invalid LGD rows: " + "; ".join(errors))
    return frame


def _frame_from_rows(rows: Any, label: str) -> pd.DataFrame:
    """Create an in-memory DataFrame from a JSON list of row objects."""
    if not isinstance(rows, list) or not rows:
        _fail(f"{label}_rows must be a non-empty JSON array when source is inline")
    if not all(isinstance(row, dict) for row in rows):
        _fail(f"{label}_rows must contain JSON objects")
    try:
        return pd.DataFrame(rows)
    except Exception as exc:
        _fail(f"Could not read {label}_rows: {exc}")
        raise AssertionError("unreachable")


def load_frames(body: dict[str, Any], require_portfolio: bool = True) -> tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """Load bundled samples fresh or create request-only DataFrames from inline rows."""
    source = body.get("source", "sample")
    if source == "sample":
        try:
            portfolio = pd.read_csv(PORTFOLIO_SAMPLE) if require_portfolio else None
            lgd = pd.read_csv(LGD_SAMPLE) if LGD_SAMPLE.exists() else None
        except FileNotFoundError:
            _fail("Bundled sample data is unavailable in this deployment")
        except Exception as exc:
            _fail(f"Could not load bundled sample data: {exc}")
    elif source == "inline":
        portfolio = _frame_from_rows(body.get("portfolio_rows"), "portfolio") if require_portfolio else None
        lgd_rows = body.get("lgd_rows")
        lgd = _frame_from_rows(lgd_rows, "lgd") if lgd_rows is not None else None
    else:
        _fail("source must be 'sample' or 'inline'")
        raise AssertionError("unreachable")
    if portfolio is not None:
        _validate_portfolio(portfolio)
    if lgd is not None:
        _validate_lgd(lgd)
    return portfolio, lgd


def build_config(body: dict[str, Any]) -> ifrs9_engine.EngineConfig:
    """Merge request config over fresh EngineConfig defaults without retaining it."""
    supplied = body.get("config", {})
    if not isinstance(supplied, dict):
        _fail("config must be a JSON object")
    defaults = asdict(ifrs9_engine.EngineConfig())
    valid = {item.name for item in fields(ifrs9_engine.EngineConfig)}
    for key, value in supplied.items():
        if key in valid and key != "scenarios":
            defaults[key] = value
    if "scenarios" in supplied:
        if not isinstance(supplied["scenarios"], dict):
            _fail("config.scenarios must be a JSON object")
        merged = {name: values.copy() for name, values in defaults["scenarios"].items()}
        for name, values in supplied["scenarios"].items():
            if not isinstance(values, dict):
                _fail(f"Scenario {name} must be a JSON object")
            merged[name] = {**merged.get(name, {}), **values}
        defaults["scenarios"] = merged
    if defaults["lgd_feed_mode"] not in {"off", "weighted", "segment"}:
        _fail("lgd_feed_mode must be 'off', 'weighted', or 'segment'")
    try:
        return ifrs9_engine.EngineConfig(**defaults)
    except Exception as exc:
        _fail(f"Invalid configuration: {exc}")
        raise AssertionError("unreachable")


def _resolve_lgd(cfg: ifrs9_engine.EngineConfig, lgd: Optional[pd.DataFrame]) -> tuple[ifrs9_engine.EngineConfig, float, str]:
    """Use LGD rows only for the current request's config copy."""
    if lgd is None or cfg.lgd_feed_mode == "off":
        return cfg, float(cfg.lgd_default), "global_default"
    try:
        if cfg.lgd_feed_mode == "segment":
            value = lgd_engine.lgd_for_ecl(lgd, mode="weighted", segment=cfg.lgd_feed_segment)
            source = "lgd_file_segment"
        else:
            value = lgd_engine.lgd_for_ecl(lgd, mode="weighted")
            source = "lgd_file_weighted"
    except Exception as exc:
        _fail(f"Could not resolve LGD from the request data: {exc}")
        raise AssertionError("unreachable")
    return replace(cfg, lgd_source="global", lgd_default=float(value)), float(value), source


def _portfolio_ecl(body: dict[str, Any]) -> tuple[pd.DataFrame, ifrs9_engine.EngineConfig, float, str]:
    portfolio, lgd = load_frames(body, require_portfolio=True)
    assert portfolio is not None
    cfg, lgd_used, lgd_source = _resolve_lgd(build_config(body), lgd)
    try:
        return ifrs9_engine.compute_ecl(portfolio, cfg), cfg, lgd_used, lgd_source
    except Exception as exc:
        _fail(str(exc))
        raise AssertionError("unreachable")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/portfolio/summary")
def portfolio_summary(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    data, _, lgd_used, lgd_source = _portfolio_ecl(body)
    result = ifrs9_engine.portfolio_summary(data)
    result.update({"lgd_used": lgd_used, "lgd_source": lgd_source})
    return _jsonable(result)


@app.post("/api/borrower")
def borrower(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    account_id = body.get("account_id")
    if account_id is None:
        _fail("account_id is required")
    data, _, _, _ = _portfolio_ecl(body)
    try:
        return _jsonable(ifrs9_engine.borrower_view(data, int(account_id)))
    except KeyError as exc:
        _fail(str(exc), status_code=404)
        raise AssertionError("unreachable")


@app.post("/api/scenarios")
def scenarios(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    data, cfg, _, _ = _portfolio_ecl(body)
    try:
        results = ifrs9_engine.run_scenarios(data, cfg)
        return _jsonable({"scenario_ecl": {name: float(results["scenario_ecl"][name].sum()) for name in results["scenario_ecl"].columns}, "weighted_ecl": float(results["weighted_ecl"].sum()), "weights": results["weights"]})
    except Exception as exc:
        _fail(str(exc))
        raise AssertionError("unreachable")


@app.post("/api/lgd/summary")
def lgd_summary(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _, lgd = load_frames(body, require_portfolio=False)
    if lgd is None:
        _fail("Provide lgd_rows or use source='sample' with bundled LGD data")
    try:
        segments = {column: lgd_engine.lgd_by_segment(lgd, column) for column in lgd_engine.SEGMENT_COLUMNS if column in lgd}
        return _jsonable({"portfolio_lgd": lgd_engine.portfolio_lgd(lgd), "segments": segments, "ltv_effect": lgd_engine.ltv_effect(lgd), "collateral_effect": lgd_engine.collateral_effect(lgd), "model_accuracy": lgd_engine.model_accuracy(lgd), "downturn_lgd": lgd_engine.downturn_lgd(lgd), "lgd_for_ecl": lgd_engine.lgd_for_ecl(lgd)})
    except Exception as exc:
        _fail(str(exc))
        raise AssertionError("unreachable")


REPORT_TEMPLATE = Template("""<!doctype html><html><head><meta charset="utf-8"><title>RiskFrame report</title><style>
body{font-family:Arial,sans-serif;color:#172033;margin:40px;line-height:1.5}h1,h2{color:#0f4c5c}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d7dee8;padding:9px;text-align:left}th{background:#edf6f5}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kpi{background:#f7fafc;border-radius:10px;padding:16px}.muted{color:#506176}</style></head><body>
<h1>RiskFrame credit risk report</h1><p class="muted">As of {{ date_range }}. IFRS 9 Credit-Risk Analytics.</p>
<h2>Portfolio KPIs</h2><div class="kpis"><div class="kpi"><b>Total ECL</b><br>{{ total_ecl }}<p>Expected Credit Loss is calculated for each loan as PD x LGD x EAD, then added across the portfolio.</p></div><div class="kpi"><b>Total EAD</b><br>{{ total_ead }}<p>Exposure at Default comes from the selected EAD column or the configured global default.</p></div><div class="kpi"><b>Provision percentage</b><br>{{ provision_pct }}<p>This is total ECL divided by total EAD.</p></div></div>
<p>PD is calibrated to the observed default rate. Stage 1 uses 12-month PD. Stage 2 uses lifetime PD = 1-(1-PD)^N. Stage 3 uses PD of 1. LGD used is {{ lgd_used }} from {{ lgd_source }}.</p>
<h2>Stage mix</h2><table><tr><th>Stage</th><th>Accounts</th><th>Share</th><th>ECL</th></tr>{% for row in stage_mix %}<tr><td>{{ row.stage }}</td><td>{{ row.count }}</td><td>{{ row.share }}</td><td>{{ row.ecl }}</td></tr>{% endfor %}</table>
<h2>Scenario view</h2><p>Baseline ECL: {{ baseline_ecl }}. Weighted stressed ECL: {{ weighted_ecl }}. Scenario ECL adjusts the calculated PD and LGD with the configured scenario multipliers before applying ECL = PD x LGD x EAD.</p>
</body></html>""")


@app.post("/api/report", response_model=None)
def report(body: dict[str, Any] = Body(...)) -> Union[dict[str, str], Response]:
    data, cfg, lgd_used, lgd_source = _portfolio_ecl(body)
    try:
        summary = ifrs9_engine.portfolio_summary(data)
        scenario = ifrs9_engine.run_scenarios(data, cfg)
        dates = pd.to_datetime(data["report_date"], errors="coerce")
        html = REPORT_TEMPLATE.render(date_range=f"{dates.min().date()} to {dates.max().date()}", total_ecl=f"{summary['total_ecl']:,.2f}", total_ead=f"{summary['total_ead']:,.2f}", provision_pct=f"{summary['provision_pct']:.2%}", lgd_used=f"{lgd_used:.4f}", lgd_source=lgd_source, stage_mix=[{"stage": int(row.stage), "count": int(row.count), "share": f"{row.share:.2%}", "ecl": f"{row.ecl:,.2f}"} for row in summary["stage_mix"].itertuples()], baseline_ecl=f"{scenario['scenario_ecl']['Baseline'].sum():,.2f}", weighted_ecl=f"{scenario['weighted_ecl'].sum():,.2f}")
        if body.get("download") is True:
            return Response(html, media_type="text/html", headers={"Content-Disposition": "attachment; filename=riskframe-report.html"})
        return {"html": html}
    except Exception as exc:
        _fail(str(exc))
        raise AssertionError("unreachable")

import { useEffect, useState } from "react";
import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { PortfolioSummary, ScenarioResult, Watchlist } from "../types";
import { currency, ErrorPanel, LoadingPanels, Panel, percent, stageColors } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";

function MetricCard({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return <Panel title={label} subtitle={detail}>{children}</Panel>;
}

export default function Portfolio({ ready }: { ready: boolean }) {
  const { portfolioBody } = useDataSource();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [watchlist, setWatchlist] = useState<Watchlist>();
  const [error, setError] = useState("");
  useEffect(() => { if (!ready) return; Promise.all([api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody), api.post<ScenarioResult>("/api/scenarios", portfolioBody), api.post<Watchlist>("/api/watchlist", portfolioBody)]).then(([portfolio, scenarios, warning]) => { setSummary(portfolio); setScenario(scenarios); setWatchlist(warning); }).catch((reason: Error) => setError(reason.message)); }, [ready, portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!summary || !scenario || !watchlist) return <LoadingPanels count={4} />;

  const baseline = scenario.scenario_ecl.Baseline ?? 0;
  const adverse = scenario.scenario_ecl.Adverse ?? 0;
  const uplift = baseline ? scenario.weighted_ecl / baseline - 1 : 0;
  const highestStage = summary.stage_mix.reduce((highest, stage) => stage.ecl > highest.ecl ? stage : highest, summary.stage_mix[0]);
  const lgdCaption = summary.lgd_source === "global_default" ? `${summary.lgd_used.toFixed(2)} default assumption` : `${summary.lgd_used.toFixed(3)} from recovery data`;

  return <Box display="grid" gap={2.5}>
    <Box display="flex" justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={2} flexWrap="wrap"><Box><Typography variant="overline" color="primary.main" fontWeight={800}>Risk explorer</Typography><Typography component="h1" variant="h4" fontWeight={800}>Where the risk is</Typography><Typography color="text.secondary" mt={.5}>See the portfolio’s loss estimate, its main concentrations, and the accounts that need attention.</Typography></Box><Chip label={`LGD: ${lgdCaption}`} variant="outlined" /></Box>
    <Box><Typography variant="overline" color="primary.main" fontWeight={800}>Portfolio risk snapshot</Typography><Typography variant="h5" fontWeight={800}>What matters now</Typography><Typography color="text.secondary">Expected loss, exposure, and the main risk concentrations in this portfolio.</Typography></Box>

    <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={2}>
      <MetricCard label="Portfolio ECL" detail="Expected credit loss across every loan."><Explainable metricId="total_ecl" payload={{ ...summary }} label="Portfolio ECL"><Figure value={currency(summary.total_ecl)} /></Explainable></MetricCard>
      <MetricCard label="ECL / EAD" detail="Expected loss as a share of total exposure."><Explainable metricId="provision_pct" payload={{ ...summary }} label="ECL divided by EAD"><Figure value={percent(summary.provision_pct, 2)} /></Explainable></MetricCard>
      <MetricCard label="Total exposure" detail="Portfolio exposure at default."><Explainable metricId="total_ead" payload={{ ...summary }} label="Total EAD"><Figure value={currency(summary.total_ead)} /></Explainable></MetricCard>
      <MetricCard label="Portfolio average PD" detail="Stage-adjusted PD used in the ECL calculation."><Explainable metricId="average_pd" payload={{ ...summary }} label="Average stage-adjusted PD"><Figure value={percent(summary.avg_pd, 2)} /></Explainable><Typography variant="caption" color="text.secondary" display="block" mt={1}>Stage 1 uses 12-month PD. Stages 2 and 3 use longer horizons.</Typography></MetricCard>
    </Box>

    <Box display="grid" gridTemplateColumns={{ lg: "1fr 1.25fr" }} gap={2}>
      <Panel title="Stage risk" subtitle="Loss is concentrated in stages where the PD horizon is longer or credit is impaired."><Table size="small" aria-label="Stage risk table"><TableHead><TableRow><TableCell>Stage</TableCell><TableCell align="right">Accounts</TableCell><TableCell align="right">Share</TableCell><TableCell align="right">ECL</TableCell></TableRow></TableHead><TableBody>{summary.stage_mix.map((row) => <TableRow key={row.stage} sx={{ bgcolor: row.stage === highestStage.stage ? "rgba(199,146,18,.09)" : "transparent" }}><TableCell><Box display="flex" alignItems="center" gap={1}><Box width={9} height={28} borderRadius={1} bgcolor={stageColors[row.stage]} /><Box><Typography fontWeight={800}>Stage {row.stage}</Typography>{row.stage === highestStage.stage && <Typography variant="caption" color="warning.dark">Largest ECL concentration</Typography>}</Box></Box></TableCell><TableCell align="right"><Figure value={row.count.toLocaleString()} variant="body2" /></TableCell><TableCell align="right"><Figure value={percent(row.share)} variant="body2" /></TableCell><TableCell align="right"><Explainable metricId="stage_ecl" payload={{ ...row, lifetime_years: 5 }} label={`Stage ${row.stage} ECL`}><Figure value={currency(row.ecl)} variant="body2" /></Explainable></TableCell></TableRow>)}</TableBody></Table><Typography variant="caption" color="text.secondary" display="block" mt={2}>Stage 1 uses 12-month PD. Stage 2 uses lifetime PD. Stage 3 uses PD of 1.0.</Typography></Panel>
      <Panel title="Where is the risk?" subtitle="Expected loss by the region supplied in the portfolio file.">{summary.ecl_by_region.length ? <Box height={310}><ResponsiveContainer><BarChart data={summary.ecl_by_region} layout="vertical" margin={{ left: 18, right: 18 }}><XAxis type="number" tickFormatter={(value) => currency(Number(value))} /><YAxis type="category" dataKey="region" width={76} /><Tooltip formatter={(value) => currency(Number(value))} /><Bar dataKey="ecl" fill="#0E4B5A" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></Box> : <Typography color="text.secondary">Add a region column to compare risk concentration across regions.</Typography>}</Panel>
    </Box>

    <Box display="grid" gridTemplateColumns={{ lg: "1fr 1fr" }} gap={2}>
      <Panel title="Portfolio stress" subtitle="Scenario outcomes show how expected loss moves when PD and LGD assumptions change."><Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={1.5}>{[["Baseline", baseline], ["Adverse", adverse], ["Weighted", scenario.weighted_ecl]].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.5, bgcolor: label === "Weighted" ? "#EAF3F3" : "#F4F6F8", borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{label}</Typography>{label === "Weighted" ? <Explainable metricId="weighted_ecl" payload={{ ...scenario }} label="Weighted stressed ECL"><Figure value={currency(Number(value))} variant="h6" /></Explainable> : <Figure value={currency(Number(value))} variant="h6" />}</Box>)}</Box><Box display="flex" justifyContent="space-between" alignItems="center" mt={2}><Chip color={uplift >= 0 ? "warning" : "success"} label={`${percent(uplift, 1)} weighted uplift`} /><Button size="small" onClick={() => navigate("/app/stress")}>View scenarios</Button></Box></Panel>
      <Panel title="Early warning" subtitle="Accounts just below the 30-day SICR line are ranked by the additional ECL if they move to Stage 2.">{watchlist.available ? <><Typography variant="h6" fontWeight={800}>{watchlist.n ?? 0} accounts are approaching Stage 2</Typography><Explainable metricId="total_ecl" payload={{ total_ecl: watchlist.total_ecl_at_risk ?? 0, total_ead: summary.total_ead, n: watchlist.n ?? 0, lgd_used: summary.lgd_used }} label="Potential ECL at risk"><Figure value={`${currency(watchlist.total_ecl_at_risk ?? 0)} potential additional lifetime ECL`} variant="body1" /></Explainable><Box display="flex" justifyContent="flex-end" mt={2}><Button size="small" onClick={() => navigate("/app/watchlist")}>Review accounts</Button></Box></> : <Typography color="text.secondary">Add a dpd column to unlock the early-warning watchlist.</Typography>}</Panel>
    </Box>
  </Box>;
}

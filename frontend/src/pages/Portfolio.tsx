import { useEffect, useState } from "react";
import { Box, Card, CardContent, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { PortfolioSummary, ScenarioResult, Watchlist } from "../types";
import { currency, ErrorPanel, LoadingPanels, Panel, percent, stageColors } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";

export default function Portfolio({ ready }: { ready: boolean }) {
  const { portfolioBody } = useDataSource();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [watchlist, setWatchlist] = useState<Watchlist>();
  const [error, setError] = useState("");
  useEffect(() => { if (!ready) return; Promise.all([api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody), api.post<ScenarioResult>("/api/scenarios", portfolioBody), api.post<Watchlist>("/api/watchlist", portfolioBody)]).then(([s, c, w]) => { setSummary(s); setScenario(c); setWatchlist(w); }).catch((err: Error) => setError(err.message)); }, [ready, portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!summary || !scenario || !watchlist) return <LoadingPanels count={5} />;
  const baseline = scenario.scenario_ecl.Baseline ?? 0;
  const uplift = baseline ? scenario.weighted_ecl / baseline - 1 : 0;
  const lgdCaption = summary.lgd_source === "global_default" ? `LGD used: ${summary.lgd_used.toFixed(2)} (default assumption)` : `LGD used: ${summary.lgd_used.toFixed(3)} (${summary.lgd_source})`;
  const kpis = [
    { label: "Total ECL", value: currency(summary.total_ecl), metricId: "total_ecl" },
    { label: "Total EAD", value: currency(summary.total_ead), metricId: "total_ead" },
    { label: "Provision % of book", value: percent(summary.provision_pct, 2), metricId: "provision_pct" },
    { label: "Average 12-month PD", value: percent(summary.avg_pd, 2), metricId: "average_pd" },
    { label: "Accounts", value: String(summary.n), metricId: "accounts" },
  ];
  return <Box display="grid" gap={2}>
    <Box display="grid" gridTemplateColumns="repeat(auto-fit,minmax(180px,1fr))" gap={2}>{kpis.map(({ label, value, metricId }) => <Card key={label}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Explainable metricId={metricId} payload={{ ...summary }} label={label}><Figure value={value} /></Explainable>{label === "Total ECL" && <Explainable metricId="lgd_used" payload={{ lgd_used: summary.lgd_used, lgd_source: summary.lgd_source }} label="LGD used"><Figure value={lgdCaption} variant="body2" /></Explainable>}{label === "Average 12-month PD" && <Typography variant="caption" display="block">ECL uses the stage-weighted PD: 12-month in Stage 1, lifetime in Stage 2, and 1.0 in Stage 3.</Typography>}</CardContent></Card>)}</Box>
    <Box display="grid" gridTemplateColumns={{ md: "1fr 1.4fr" }} gap={2}>
      <Panel title="Stage mix" subtitle="Each stage determines which PD horizon contributes to ECL."><Box height={240}><ResponsiveContainer><PieChart><Pie data={summary.stage_mix} dataKey="share" nameKey="stage" innerRadius={55} outerRadius={88}>{summary.stage_mix.map((row) => <Cell key={row.stage} fill={stageColors[row.stage]} />)}</Pie><Tooltip formatter={(v) => percent(Number(v))} /><Legend /></PieChart></ResponsiveContainer></Box><Table size="small"><TableHead><TableRow><TableCell>Stage</TableCell><TableCell>Count</TableCell><TableCell>Share</TableCell><TableCell>ECL</TableCell></TableRow></TableHead><TableBody>{summary.stage_mix.map((row) => <TableRow key={row.stage}><TableCell><Chip size="small" label={`Stage ${row.stage}`} sx={{ bgcolor: stageColors[row.stage], color: "white" }} /></TableCell><TableCell>{row.count}</TableCell><TableCell><Figure value={percent(row.share)} variant="body2" /></TableCell><TableCell><Explainable metricId="stage_ecl" payload={{ ...row, lifetime_years: 5 }} label={`Stage ${row.stage} ECL`}><Figure value={currency(row.ecl)} variant="body2" /></Explainable></TableCell></TableRow>)}</TableBody></Table></Panel>
      <Panel title="ECL by region" subtitle="Portfolio expected loss grouped by the region provided in the loan file.">{summary.ecl_by_region.length ? <Box height={340}><ResponsiveContainer><BarChart data={summary.ecl_by_region} layout="vertical" margin={{ left: 24 }}><XAxis type="number" tickFormatter={(v) => currency(Number(v))} /><YAxis type="category" dataKey="region" width={90} /><Tooltip formatter={(v) => currency(Number(v))} /><Bar dataKey="ecl" fill="#0f6b72" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></Box> : <Typography color="text.secondary">Add a region column to unlock ECL by region.</Typography>}</Panel>
    </Box>
    <Box display="grid" gridTemplateColumns={{ md: "1.5fr 1fr" }} gap={2}>
      <Panel title="Monthly ECL trend" subtitle="Aggregate trend. Per-account migration is not shown because the sample is one row per account."><Box height={260}><ResponsiveContainer><LineChart data={summary.monthly}><XAxis dataKey="report_month" /><YAxis tickFormatter={(v) => currency(Number(v))} /><Tooltip formatter={(v) => currency(Number(v))} /><Line type="monotone" dataKey="ecl" stroke="#0f6b72" strokeWidth={3} dot /></LineChart></ResponsiveContainer></Box></Panel>
      <Panel title="Baseline vs stressed" subtitle="Scenario weights combine the baseline, adverse, and upside ECL outcomes."><Figure value={currency(baseline)} /><Typography color="text.secondary">Baseline ECL</Typography><Box mt={2}><Explainable metricId="weighted_ecl" payload={{ ...scenario }} label="Weighted stressed ECL"><Figure value={currency(scenario.weighted_ecl)} /></Explainable></Box><Typography color="text.secondary">Weighted stressed ECL</Typography><Chip sx={{ mt: 2 }} color={uplift >= 0 ? "warning" : "success"} label={`${percent(uplift, 1)} uplift`} /></Panel>
    </Box>
    <Panel title="Early-warning watchlist" subtitle="Accounts just below the 30-day SICR line are ranked by the additional lifetime ECL if they move to Stage 2.">{watchlist.available ? <><Figure value={`${watchlist.n ?? 0} accounts are one step from Stage 2, ${currency(watchlist.total_ecl_at_risk ?? 0)} of lifetime ECL at risk`} variant="body1" /><Table size="small" sx={{ mt: 2 }}><TableHead><TableRow><TableCell>Account</TableCell><TableCell>DPD</TableCell><TableCell>Current ECL</TableCell><TableCell>Potential ECL</TableCell><TableCell>ECL at risk</TableCell></TableRow></TableHead><TableBody>{(watchlist.rows ?? []).slice(0, 20).map((row) => <TableRow key={row.account_id}><TableCell><Figure value={String(row.account_id)} variant="body2" /></TableCell><TableCell><Figure value={row.dpd.toFixed(0)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.current_ecl)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.potential_ecl)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.ecl_at_risk)} variant="body2" /></TableCell></TableRow>)}</TableBody></Table></> : <Typography color="text.secondary">Add a dpd column to unlock the early-warning watchlist.</Typography>}</Panel>
  </Box>;
}

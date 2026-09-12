import { useEffect, useState } from "react";
import { Box, Card, CardContent, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { PortfolioSummary, ScenarioResult } from "../types";
import { currency, ErrorPanel, LoadingPanels, Panel, percent, stageColors } from "../components/Common";
import { useDataSource } from "../dataSource";

export default function Portfolio({ ready }: { ready: boolean }) {
  const { portfolioBody } = useDataSource();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [error, setError] = useState("");
  useEffect(() => { if (!ready) return; Promise.all([api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody), api.post<ScenarioResult>("/api/scenarios", portfolioBody)]).then(([s, c]) => { setSummary(s); setScenario(c); }).catch((err: Error) => setError(err.message)); }, [ready, portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!summary || !scenario) return <LoadingPanels count={5} />;
  const baseline = scenario.scenario_ecl.Baseline ?? 0;
  const uplift = baseline ? scenario.weighted_ecl / baseline - 1 : 0;
  const kpis = [["Total ECL", currency(summary.total_ecl)], ["Total EAD", currency(summary.total_ead)], ["Provision % of book", percent(summary.provision_pct, 2)], ["Average PD", percent(summary.avg_pd, 2)], ["Accounts", String(summary.n)]];
  return <Box display="grid" gap={2}>
    <Box display="grid" gridTemplateColumns="repeat(auto-fit,minmax(180px,1fr))" gap={2}>{kpis.map(([label, value]) => <Card key={label}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography>{label === "Total ECL" && <Typography variant="caption">LGD used: {summary.lgd_used.toFixed(3)} ({summary.lgd_source})</Typography>}</CardContent></Card>)}</Box>
    <Box display="grid" gridTemplateColumns={{ md: "1fr 1.4fr" }} gap={2}>
      <Panel title="Stage mix" subtitle="Each stage determines which PD horizon contributes to ECL."><Box height={240}><ResponsiveContainer><PieChart><Pie data={summary.stage_mix} dataKey="share" nameKey="stage" innerRadius={55} outerRadius={88}>{summary.stage_mix.map((row) => <Cell key={row.stage} fill={stageColors[row.stage]} />)}</Pie><Tooltip formatter={(v) => percent(Number(v))} /><Legend /></PieChart></ResponsiveContainer></Box><Table size="small"><TableHead><TableRow><TableCell>Stage</TableCell><TableCell>Count</TableCell><TableCell>Share</TableCell><TableCell>ECL</TableCell></TableRow></TableHead><TableBody>{summary.stage_mix.map((row) => <TableRow key={row.stage}><TableCell><Chip size="small" label={`Stage ${row.stage}`} sx={{ bgcolor: stageColors[row.stage], color: "white" }} /></TableCell><TableCell>{row.count}</TableCell><TableCell>{percent(row.share)}</TableCell><TableCell>{currency(row.ecl)}</TableCell></TableRow>)}</TableBody></Table></Panel>
      <Panel title="ECL by region" subtitle="Portfolio expected loss grouped by the region provided in the loan file."><Box height={340}><ResponsiveContainer><BarChart data={summary.ecl_by_region} layout="vertical" margin={{ left: 24 }}><XAxis type="number" tickFormatter={(v) => currency(Number(v))} /><YAxis type="category" dataKey="region" width={90} /><Tooltip formatter={(v) => currency(Number(v))} /><Bar dataKey="ecl" fill="#0f6b72" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></Box></Panel>
    </Box>
    <Box display="grid" gridTemplateColumns={{ md: "1.5fr 1fr" }} gap={2}>
      <Panel title="Monthly ECL trend" subtitle="Aggregate trend. Per-account migration is not shown because the sample is one row per account."><Box height={260}><ResponsiveContainer><LineChart data={summary.monthly}><XAxis dataKey="report_month" /><YAxis tickFormatter={(v) => currency(Number(v))} /><Tooltip formatter={(v) => currency(Number(v))} /><Line type="monotone" dataKey="ecl" stroke="#0f6b72" strokeWidth={3} dot /></LineChart></ResponsiveContainer></Box></Panel>
      <Panel title="Baseline vs stressed" subtitle="Scenario weights combine the baseline, adverse, and upside ECL outcomes."><Typography variant="h5">{currency(baseline)}</Typography><Typography color="text.secondary">Baseline ECL</Typography><Typography variant="h5" sx={{ mt: 2 }}>{currency(scenario.weighted_ecl)}</Typography><Typography color="text.secondary">Weighted stressed ECL</Typography><Chip sx={{ mt: 2 }} color={uplift >= 0 ? "warning" : "success"} label={`${percent(uplift, 1)} uplift`} /></Panel>
    </Box>
  </Box>;
}

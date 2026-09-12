import { useCallback, useEffect, useState } from "react";
import { Box, Button, Slider, TextField, Typography } from "@mui/material";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { ScenarioResult } from "../types";
import { currency, ErrorPanel, Panel } from "../components/Common";
import { useDataSource } from "../dataSource";

type Scenario = { pd_mult: number; lgd_mult: number; weight: number };
const defaults: Record<string, Scenario> = { Baseline: { pd_mult: 1, lgd_mult: 1, weight: 0.4 }, Adverse: { pd_mult: 1.5, lgd_mult: 1.15, weight: 0.4 }, Upside: { pd_mult: 0.8, lgd_mult: 0.95, weight: 0.2 } };

export default function Scenarios() {
  const { portfolioBody } = useDataSource();
  const [scenarios, setScenarios] = useState(defaults); const [result, setResult] = useState<ScenarioResult>(); const [error, setError] = useState("");
  const totalWeight = Object.values(scenarios).reduce((sum, row) => sum + row.weight, 0);
  const calculate = useCallback((values = scenarios) => api.post<ScenarioResult>("/api/scenarios", { ...portfolioBody, config: { scenarios: values } }).then(setResult).catch((err: Error) => setError(err.message)), [scenarios, portfolioBody]);
  useEffect(() => { calculate(); }, [calculate]);
  const change = (name: string, key: keyof Scenario, value: number) => setScenarios((prior) => ({ ...prior, [name]: { ...prior[name], [key]: value } }));
  const normalise = () => { if (!totalWeight) return; const normalized = Object.fromEntries(Object.entries(scenarios).map(([name, row]) => [name, { ...row, weight: row.weight / totalWeight }])); setScenarios(normalized); calculate(normalized); };
  const chart = result ? [...Object.entries(result.scenario_ecl).map(([name, ecl]) => ({ name, ecl })), { name: "Weighted", ecl: result.weighted_ecl }] : [];
  return <Box display="grid" gap={2}><Panel title="Scenario inputs" subtitle="Adjust the PD and LGD multipliers, then compare their portfolio ECL outcomes."><Box display="grid" gap={2}>{Object.entries(scenarios).map(([name, row]) => <Box key={name} display="grid" gridTemplateColumns={{ md: "140px 1fr 1fr 1fr" }} gap={2} alignItems="center"><Typography fontWeight={700}>{name}</Typography><TextField type="number" label="PD multiplier" value={row.pd_mult} inputProps={{ step: 0.05, min: 0 }} onChange={(e) => change(name, "pd_mult", Number(e.target.value))} /><TextField type="number" label="LGD multiplier" value={row.lgd_mult} inputProps={{ step: 0.05, min: 0 }} onChange={(e) => change(name, "lgd_mult", Number(e.target.value))} /><Box><Typography variant="body2">Weight {(row.weight * 100).toFixed(0)}%</Typography><Slider value={row.weight} min={0} max={1} step={0.01} onChange={(_, value) => change(name, "weight", Number(value))} /></Box></Box>)}</Box><Typography color={Math.abs(totalWeight - 1) < 0.001 ? "success.main" : "warning.main"} sx={{ mt: 2 }}>Weights total {(totalWeight * 100).toFixed(1)}%. Weights must sum to 100%.</Typography><Box display="flex" gap={1} mt={1}><Button variant="contained" onClick={normalise}>Normalise and recalculate</Button><Button onClick={() => setScenarios(defaults)}>Reset to defaults</Button></Box></Panel>{error && <ErrorPanel message={error} />}{result && <Panel title="Scenario ECL" subtitle="The weighted headline normalises scenario weights to a total of 100%."><Typography variant="h5">Weighted ECL: {currency(result.weighted_ecl)}</Typography><Box height={300}><ResponsiveContainer><BarChart data={chart}><XAxis dataKey="name" /><YAxis tickFormatter={(v) => currency(Number(v))} /><Tooltip formatter={(v) => currency(Number(v))} /><Bar dataKey="ecl" fill="#0f6b72" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Box></Panel>}</Box>;
}

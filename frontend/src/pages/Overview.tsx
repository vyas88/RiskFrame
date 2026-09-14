import { useEffect, useState } from "react";
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { api } from "../api";
import { ErrorPanel, LoadingPanels, Panel, percent, stageColors } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";
import type { PortfolioSummary, ScenarioResult } from "../types";

const compactMoney = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2,
}).format(value);

export default function Overview() {
  const { portfolioBody } = useDataSource();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [scenarios, setScenarios] = useState<ScenarioResult>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!portfolioBody) return;
    let active = true;
    setSummary(undefined); setScenarios(undefined); setError("");
    void Promise.all([
      api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody),
      api.post<ScenarioResult>("/api/scenarios", portfolioBody),
    ]).then(([portfolio, stress]) => {
      if (active) { setSummary(portfolio); setScenarios(stress); }
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!summary || !scenarios) return <LoadingPanels count={4} />;

  const baseline = scenarios.scenario_ecl.Baseline;
  const delta = baseline === undefined ? undefined : scenarios.weighted_ecl - baseline;
  const uplift = baseline !== undefined && baseline > 0 ? delta! / baseline : undefined;
  const upliftLabel = uplift !== undefined ? `${uplift > 0 ? "+" : ""}${percent(uplift)} vs baseline`
    : delta === 0 ? "Unchanged from baseline" : "Percentage uplift unavailable";
  const headline = delta === undefined ? "Weighted stressed ECL combines the applied scenario outcomes."
    : delta === 0 ? "Weighted stress leaves ECL unchanged from baseline."
    : `Weighted stress ${delta > 0 ? "increases" : "reduces"} ECL by ${compactMoney(Math.abs(delta))}${uplift !== undefined ? ` (${percent(Math.abs(uplift))})` : ""} versus the Baseline scenario.`;
  const stages = [...summary.stage_mix].sort((left, right) => left.stage - right.stage);
  const maximumEcl = Math.max(...stages.map((stage) => stage.ecl), 0);
  const leadingStages = stages.filter((stage) => Math.abs(stage.ecl - maximumEcl) < .01 && stage.count > 0);
  const concentration = maximumEcl > 0 && summary.total_ecl > 0 && leadingStages.length
    ? `${leadingStages.map((stage) => `Stage ${stage.stage}`).join(" and ")} ${leadingStages.length > 1 ? "tie for the largest ECL contribution" : "has the largest ECL contribution"}, at ${percent(maximumEcl / summary.total_ecl)} of portfolio ECL${leadingStages.length > 1 ? " each" : ""}. Explore the stages and regions behind this concentration.`
    : "Explore the stage and regional breakdown to understand the current portfolio composition.";
  const metrics = [
    { title: "Total EAD", value: compactMoney(summary.total_ead), detail: "Exposure used in the loss calculation.", metric: "total_ead", payload: { ...summary } },
    { title: "Expected Credit Loss", value: compactMoney(summary.total_ecl), detail: "Expected loss across the current accounts.", metric: "total_ecl", payload: { ...summary } },
    { title: "Provision rate", value: percent(summary.provision_pct, 2), detail: "Expected Credit Loss / Total EAD.", metric: "provision_pct", payload: { ...summary } },
    { title: "Weighted stressed ECL", value: compactMoney(scenarios.weighted_ecl), detail: upliftLabel, metric: "weighted_ecl", payload: { ...scenarios } },
  ];
  return <Box display="grid" gap={2.5}>
    <Box>
      <Explainable metricId="accounts" label="Accounts" payload={{ ...summary }}><Figure value={`${summary.n.toLocaleString()} accounts`} variant="h6" /></Explainable>
      <Typography variant="body2" color="text.secondary" mt={.5}>
        Across {summary.n.toLocaleString()} accounts and {compactMoney(summary.total_ead)} of exposure, expected credit loss is {compactMoney(summary.total_ecl)}, equivalent to {percent(summary.provision_pct, 2)} of EAD.
      </Typography>
    </Box>
    <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }} gap={2}>
      {metrics.map((metric) => <Box key={metric.metric} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2.5 }}>
        <Typography variant="body2" color="text.secondary" mb={1}>{metric.title}</Typography>
        <Explainable metricId={metric.metric} payload={metric.payload} label={metric.title}><Figure value={metric.value} /></Explainable>
        <Typography variant="caption" color={metric.metric === "weighted_ecl" ? "primary.main" : "text.secondary"} fontWeight={metric.metric === "weighted_ecl" ? 700 : 400} display="block" mt={1}>{metric.detail}</Typography>
      </Box>)}
    </Box>
    <Box sx={{ borderLeft: "4px solid", borderColor: "primary.main", borderRadius: 1, bgcolor: "#EDF4F4", p: 2 }}>
      <Typography variant="overline" color="primary.main" fontWeight={800}>Headline</Typography>
      <Typography fontWeight={700}>{headline}</Typography>
      <Typography variant="body2" color="text.secondary" mt={.5}>{concentration}</Typography>
    </Box>
    <Panel title="Where the risk sits" subtitle="Account shares show the portfolio composition; ECL shows each stage's contribution to expected loss.">
      {stages.length ? <>
        <Box display="flex" height={18} overflow="hidden" borderRadius={1} bgcolor="grey.100" aria-hidden>{stages.map((stage) => <Box key={stage.stage} width={`${stage.share * 100}%`} bgcolor={stageColors[stage.stage]} />)}</Box>
        <Box overflow="auto" mt={1.5}><Table size="small" aria-label="Portfolio stage composition"><TableHead><TableRow><TableCell>Stage</TableCell><TableCell align="right">Accounts</TableCell><TableCell align="right">Account share</TableCell><TableCell align="right">ECL</TableCell></TableRow></TableHead><TableBody>{stages.map((stage) => <TableRow key={stage.stage}>
          <TableCell><Box display="flex" gap={1} alignItems="center"><Box width={9} height={9} borderRadius="50%" bgcolor={stageColors[stage.stage]} /><Typography variant="body2" fontWeight={700}>Stage {stage.stage}</Typography></Box></TableCell>
          <TableCell align="right"><Figure value={stage.count.toLocaleString()} variant="body2" /></TableCell>
          <TableCell align="right"><Figure value={percent(stage.share)} variant="body2" /></TableCell>
          <TableCell align="right"><Explainable metricId="stage_ecl" label={`Stage ${stage.stage} ECL`} payload={{ ...stage }}><Figure value={compactMoney(stage.ecl)} variant="body2" /></Explainable></TableCell>
        </TableRow>)}</TableBody></Table></Box>
      </> : <Typography color="text.secondary">No stage breakdown is available for this portfolio.</Typography>}
    </Panel>
  </Box>;
}

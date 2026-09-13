import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { api } from "../api";
import { currency, ErrorPanel, LoadingPanels, Panel, percent } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";
import type { PortfolioSummary, ScenarioResult } from "../types";

export default function Overview() {
  const { portfolioBody } = useDataSource();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [scenarios, setScenarios] = useState<ScenarioResult>();
  const [error, setError] = useState("");
  useEffect(() => { Promise.all([api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody), api.post<ScenarioResult>("/api/scenarios", portfolioBody)]).then(([portfolio, stress]) => { setSummary(portfolio); setScenarios(stress); }).catch((reason: Error) => setError(reason.message)); }, [portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!summary || !scenarios) return <LoadingPanels count={3} />;
  return <Box display="grid" gap={2.5}>
    <Panel title="Your portfolio at a glance" subtitle={`Across ${summary.n.toLocaleString()} loans, expected loss is ${currency(summary.total_ecl)}, about ${percent(summary.provision_pct, 2)} of everything lent.`}>
      <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }} gap={2}>
        <Panel title="Expected loss" subtitle="The calculated provision across every loan."><Explainable metricId="total_ecl" payload={{ ...summary }} label="Expected loss"><Figure value={currency(summary.total_ecl)} /></Explainable></Panel>
        <Panel title="Share of book" subtitle="Expected loss as a share of total exposure."><Explainable metricId="provision_pct" payload={{ ...summary }} label="Share of book"><Figure value={percent(summary.provision_pct, 2)} /></Explainable></Panel>
        <Panel title="If times get hard" subtitle="Probability-weighted ECL across the three scenarios."><Explainable metricId="weighted_ecl" payload={{ ...scenarios }} label="If times get hard"><Figure value={currency(scenarios.weighted_ecl)} /></Explainable></Panel>
      </Box>
    </Panel>
  </Box>;
}

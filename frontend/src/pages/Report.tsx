import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { api } from "../api";
import { ErrorPanel, LoadingPanels, Panel } from "../components/Common";
import { useDataSource } from "../dataSource";

export default function Report() {
  const { portfolioBody } = useDataSource();
  const [html, setHtml] = useState(""); const [error, setError] = useState("");
  useEffect(() => { api.post<{ html: string }>("/api/report", portfolioBody).then((result) => setHtml(result.html)).catch((err: Error) => setError(err.message)); }, [portfolioBody]);
  if (error) return <ErrorPanel message={error} />; if (!html) return <LoadingPanels count={1} />;
  const download = async () => { try { const content = await api.postText("/api/report", { ...portfolioBody, download: true }); const url = URL.createObjectURL(new Blob([content], { type: "text/html" })); const link = document.createElement("a"); link.href = url; link.download = "riskframe-report.html"; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof Error ? err.message : "Could not download report"); } };
  return <Panel title="RiskFrame report" subtitle="The standalone report uses the same request-scoped dashboard calculations."><Button variant="contained" onClick={download} sx={{ mb: 2 }}>Download report</Button><Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}><iframe title="RiskFrame report preview" srcDoc={html} style={{ width: "100%", minHeight: 720, border: 0 }} /></Box><Typography variant="caption">Preview uses fresh sample data for this request.</Typography></Panel>;
}

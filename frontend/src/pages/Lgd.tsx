import { useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { LgdSummary } from "../types";
import { currency, ErrorPanel, LoadingPanels, Panel, percent } from "../components/Common";
import { Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";

type SegmentRow = { count: number; total_ead: number; mean_lgd: number; ead_weighted_lgd: number; [key: string]: string | number };
type ExplorerSelection = { dimension: string; name: string; lgd: number; count: number; ead: number } | undefined;

function segmentName(row: SegmentRow) {
  return String(Object.entries(row).find(([key]) => !["count", "total_ead", "mean_lgd", "ead_weighted_lgd"].includes(key))?.[1] ?? "Unspecified");
}

function DriverChart({ title, data, onSelect, selected }: { title: string; data: SegmentRow[]; onSelect: (selection: ExplorerSelection) => void; selected?: ExplorerSelection }) {
  const maximum = Math.max(...data.map((row) => row.ead_weighted_lgd), 0.01);
  return <Panel title={title} subtitle="Select a segment to focus the recovery explorer on that observed loss-severity driver."><Stack spacing={1.4}>{data.map((row) => {
    const name = segmentName(row); const active = selected?.dimension === title && selected.name === name;
    return <Button key={name} variant={active ? "contained" : "text"} color="inherit" onClick={() => onSelect({ dimension: title, name, lgd: row.ead_weighted_lgd, count: row.count, ead: row.total_ead })} sx={{ justifyContent: "flex-start", px: 1, py: .75, textAlign: "left", textTransform: "none", border: active ? "1px solid" : "1px solid transparent", borderColor: active ? "primary.main" : "transparent" }}><Box width="100%"><Box display="flex" justifyContent="space-between" gap={2} mb={.5}><Typography variant="body2" fontWeight={700}>{name}</Typography><Typography variant="body2" fontWeight={800}>{percent(row.ead_weighted_lgd)}</Typography></Box><Box height={11} borderRadius={99} bgcolor="grey.100" overflow="hidden"><Box height="100%" width={`${(row.ead_weighted_lgd / maximum) * 100}%`} borderRadius={99} bgcolor="primary.main" /></Box></Box></Button>;
  })}</Stack></Panel>;
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <Panel title={title} subtitle={detail}><Figure value={value} /></Panel>;
}

function protectionLabel(effect: string, group: string) {
  if (effect === "collateral") return group === "has_collateral" ? "Present" : "None";
  if (effect === "guarantee") return group === "flag_1" ? "Present" : "None";
  return group.replace(/_/g, " ");
}

export default function Lgd() {
  const { lgdBody, hasLgd } = useDataSource();
  const navigate = useNavigate();
  const [data, setData] = useState<LgdSummary>();
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<ExplorerSelection>();
  useEffect(() => { if (!lgdBody) return; api.post<LgdSummary>("/api/lgd/summary", lgdBody).then(setData).catch((err: Error) => setError(err.message)); }, [lgdBody]);

  if (!hasLgd) return <Panel title="Recoveries and loss severity" subtitle="This view uses an optional recovery file to explain loss severity."><Typography color="text.secondary">No recovery file loaded. Upload an LGD file to see loss severity by collateral, seniority, LTV and recovery protection.</Typography><Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate("/start?upload=lgd")}>Upload an LGD file</Button></Panel>;
  if (error) return <ErrorPanel message={error} />;
  if (!data) return <LoadingPanels count={4} />;

  const headline = data.portfolio_lgd;
  const weightedRecovery = Math.max(0, 1 - headline.ead_weighted_lgd);
  const scatter = data.model_accuracy ? data.model_accuracy.scatter_obs.map((obs, index) => ({ obs, pred: data.model_accuracy!.scatter_pred[index] })) : [];
  const collateral = data.segments.COLLATERAL_TYPE ?? [];
  const seniority = data.segments.SENIORITY ?? [];
  const ltvRows = data.ltv_effect ?? [];
  const highestLtv = [...ltvRows].sort((left, right) => right.mean_lgd - left.mean_lgd)[0];
  const highestCollateral = [...collateral].sort((left, right) => right.ead_weighted_lgd - left.ead_weighted_lgd)[0];
  const insight = highestLtv && highestCollateral
    ? `Higher LTV and ${segmentName(highestCollateral).toLowerCase()} collateral exposures show the highest observed loss severity in this file.`
    : highestLtv
      ? `The ${highestLtv.ltv_bucket} LTV bucket shows the highest observed loss severity in this file.`
      : "Review recovery assumptions by collateral, seniority and exposure segment as more fields become available.";

  return <Box display="grid" gap={2.5}>
    <Box><Typography variant="overline" color="primary.main" fontWeight={800}>Recovery to loss severity</Typography><Typography component="h1" variant="h4" fontWeight={800}>Recoveries and loss severity</Typography><Typography color="text.secondary" mt={.5}>See how recovery assumptions translate into LGD and feed expected credit loss.</Typography></Box>

    <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={2}>
      <MetricCard title="Total EAD" value={currency(headline.total_ead)} detail={`${headline.n.toLocaleString()} recovery observations in the file.`} />
      <MetricCard title="EAD-weighted LGD" value={percent(headline.ead_weighted_lgd, 2)} detail="The headline loss-severity assumption used by ECL." />
      <MetricCard title="EAD-weighted recovery" value={percent(weightedRecovery, 2)} detail="One minus the EAD-weighted LGD, shown on the same weighting basis." />
      <MetricCard title="Average observed LGD" value={percent(headline.mean_lgd, 2)} detail={`Unweighted average across accounts. Average observed recovery: ${percent(headline.mean_recovery, 2)}.`} />
    </Box>

    <Panel title="Recovery explorer" subtitle="Recovery affects loss severity, which combines with PD and EAD to produce ECL."><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr auto 1fr auto 1fr" }} gap={1.5} alignItems="stretch"><Box><Typography variant="overline" color="text.secondary">Portfolio</Typography><Typography variant="h5" fontWeight={800}>{percent(headline.ead_weighted_lgd, 2)} LGD</Typography><Typography variant="body2" color="text.secondary">{currency(headline.total_ead)} exposed at default</Typography></Box><Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} /><Box><Typography variant="overline" color="text.secondary">Selected driver</Typography>{selection ? <><Typography variant="h6" fontWeight={800}>{selection.dimension}: {selection.name}</Typography><Typography variant="body2" color="text.secondary">{percent(selection.lgd, 2)} EAD-weighted LGD across {selection.count.toLocaleString()} observations.</Typography><Button size="small" sx={{ mt: .5, px: 0 }} onClick={() => setSelection(undefined)}>Reset selection</Button></> : <Typography variant="body2" color="text.secondary">Choose a collateral or seniority bar below to inspect its observed loss severity.</Typography>}</Box><Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} /><Box><Typography variant="overline" color="text.secondary">ECL implication</Typography><Typography variant="body1" fontWeight={800}>PD × LGD × EAD</Typography><Typography variant="body2" color="text.secondary">Every $1 of EAD carries about {percent(headline.ead_weighted_lgd, 1)} of expected loss severity and {percent(weightedRecovery, 1)} of expected recovery, before PD is applied.</Typography></Box></Box></Panel>

    <Box><Typography variant="overline" color="primary.main" fontWeight={800}>Where loss severity is highest</Typography><Typography variant="h5" fontWeight={800}>What drives LGD?</Typography><Typography color="text.secondary" variant="body2">Use the bars as a lightweight recovery explorer. The API reports each dimension independently, so selections are not combined into a synthetic cross-segment result.</Typography></Box>
    <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2}>{collateral.length > 0 && <DriverChart title="LGD by collateral" data={collateral} selected={selection} onSelect={setSelection} />}{seniority.length > 0 && <DriverChart title="LGD by seniority" data={seniority} selected={selection} onSelect={setSelection} />}{!collateral.length && !seniority.length && <Panel title="Loss-severity drivers" subtitle="Segment analysis appears when the recovery file includes collateral or seniority."><Typography color="text.secondary">No collateral or seniority segment data is available.</Typography></Panel>}</Box>

    {ltvRows.length > 0 && <Panel title="Higher LTV, higher observed LGD" subtitle="Observed loss severity by loan-to-value bucket. A missing bar means no observations, not zero LGD."><Box height={270}><ResponsiveContainer><BarChart data={ltvRows}><CartesianGrid vertical={false} /><XAxis dataKey="ltv_bucket" /><YAxis tickFormatter={(value) => percent(Number(value))} /><Tooltip formatter={(value) => percent(Number(value))} /><Bar dataKey="mean_lgd" fill="#E0A500" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Box><Box display="flex" gap={1} flexWrap="wrap" mt={1}>{ltvRows.map((row) => <Chip key={row.ltv_bucket} label={`${row.ltv_bucket}: ${percent(row.mean_lgd)} (${row.count.toLocaleString()} observations)`} variant="outlined" />)}</Box></Panel>}

    {data.collateral_effect && <Panel title="Recovery protection" subtitle="Observed LGD with and without collateral or guarantees. Zero values are presented as no observations so they are not mistaken for zero loss."><Box overflow="auto"><Table size="small"><TableHead><TableRow><TableCell>Protection</TableCell><TableCell>Group</TableCell><TableCell align="right">Mean LGD</TableCell><TableCell align="right">LGD impact</TableCell></TableRow></TableHead><TableBody>{Object.entries(data.collateral_effect).flatMap(([effect, groups]) => { const baseline = Object.entries(groups).find(([group]) => group === "none" || group === "flag_0")?.[1]; return Object.entries(groups).map(([group, value]) => { const impact = baseline !== undefined && value > 0 ? value - baseline : undefined; return <TableRow key={`${effect}-${group}`}><TableCell sx={{ textTransform: "capitalize" }}>{effect}</TableCell><TableCell>{protectionLabel(effect, group)}</TableCell><TableCell align="right">{value === 0 ? <Typography variant="body2" color="text.secondary">No observations</Typography> : <Figure value={percent(value)} variant="body2" />}</TableCell><TableCell align="right">{impact === undefined ? "Not available" : `${impact > 0 ? "+" : ""}${(impact * 100).toFixed(1)} pp`}</TableCell></TableRow>; }); })}</TableBody></Table></Box></Panel>}

    <Panel title="Recovery implication" subtitle="The practical connection between recovery data and the provision."><Typography variant="h6" fontWeight={800}>Portfolio LGD: {percent(data.lgd_for_ecl, 2)}</Typography><Typography color="text.secondary" mt={.5}>Every $1 of EAD is assigned about {percent(data.lgd_for_ecl, 1)} of loss severity before its PD horizon is applied. {insight}</Typography><Box sx={{ borderLeft: "4px solid", borderColor: "primary.main", bgcolor: "primary.50", p: 1.5, mt: 2, borderRadius: 1 }}><Typography variant="body2" fontWeight={700}>Key takeaway</Typography><Typography variant="body2">{insight}</Typography></Box></Panel>

    {data.model_accuracy && <Accordion elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "12px !important", "&:before": { display: "none" } }}><AccordionSummary expandIcon="+"><Box><Typography fontWeight={800}>Model validation</Typography><Typography variant="body2" color="text.secondary">Optional diagnostics for observed versus predicted LGD. Kept separate from the recovery analysis.</Typography></Box></AccordionSummary><AccordionDetails><Typography variant="body2" color="text.secondary" mb={2}>MAE {data.model_accuracy.mae.toFixed(3)}, RMSE {data.model_accuracy.rmse.toFixed(3)} and correlation {data.model_accuracy.corr.toFixed(3)} compare observed and predicted LGD.</Typography><Box height={280}><ResponsiveContainer><ScatterChart><CartesianGrid /><XAxis dataKey="obs" name="Observed" tickFormatter={(value) => percent(Number(value))} /><YAxis dataKey="pred" name="Predicted" tickFormatter={(value) => percent(Number(value))} /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter data={scatter} fill="#0E4B5A" /></ScatterChart></ResponsiveContainer></Box></AccordionDetails></Accordion>}
  </Box>;
}

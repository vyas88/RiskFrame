import { useEffect, useRef, useState, type ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { api } from "../api";
import type { ScenarioResult, Sensitivity } from "../types";
import { currency, ErrorPanel, LoadingPanels, Panel, percent } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";

type Scenario = { pd_mult: number; lgd_mult: number; weight: number };
type Assumptions = Record<string, Scenario>;
type Draft = Record<string, { pd_mult: string; lgd_mult: string; weight: string }>;
const defaults: Assumptions = {
  Baseline: { pd_mult: 1, lgd_mult: 1, weight: .4 },
  Adverse: { pd_mult: 1.5, lgd_mult: 1.15, weight: .4 },
  Upside: { pd_mult: .8, lgd_mult: .95, weight: .2 },
};
const colors: Record<string, string> = { Baseline: "#0E4B5A", Adverse: "#B14B43", Upside: "#568174" };
const asDraft = (values: Assumptions): Draft => Object.fromEntries(Object.entries(values).map(([name, row]) => [name, { pd_mult: String(row.pd_mult), lgd_mult: String(row.lgd_mult), weight: String(Number((row.weight * 100).toFixed(6))) }]));
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${currency(Math.abs(value))}`;
const changePct = (value: number, baseline: number) => baseline > 0 ? `${value > baseline ? "+" : ""}${percent((value - baseline) / baseline)}` : value === 0 ? "0.0%" : "Not defined";
const shortMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);

function Metric({ title, value, note, highlight = false, children }: { title: string; value: string; note: string; highlight?: boolean; children?: ReactNode }) {
  return <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: highlight ? "#0E4B5A" : "background.paper", color: highlight ? "white" : "text.primary", border: "1px solid", borderColor: highlight ? "#0E4B5A" : "divider" }}>
    <Typography variant="body2" mb={1}>{title}</Typography>
    {children ?? <Figure value={value} />}
    <Typography variant="caption" display="block" mt={1} sx={{ opacity: .8 }}>{note}</Typography>
  </Box>;
}

export default function Scenarios() {
  const { portfolioBody } = useDataSource();
  const [draft, setDraft] = useState<Draft>(() => asDraft(defaults));
  const [applied, setApplied] = useState<Assumptions>(defaults);
  const [result, setResult] = useState<ScenarioResult>();
  const [sensitivity, setSensitivity] = useState<Sensitivity>();
  const [error, setError] = useState("");
  const [sensitivityError, setSensitivityError] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    if (!portfolioBody) return;
    const id = ++requestId.current;
    setResult(undefined); setSensitivity(undefined); setError(""); setSensitivityError(""); setBusy(true);
    setDraft(asDraft(defaults)); setApplied(defaults); setNotice("");
    void api.post<ScenarioResult>("/api/scenarios", { ...portfolioBody, config: { scenarios: defaults } })
      .then((response) => { if (id === requestId.current) setResult(response); })
      .catch((reason: Error) => { if (id === requestId.current) setError(reason.message); })
      .finally(() => { if (id === requestId.current) setBusy(false); });
    let active = true;
    void api.post<Sensitivity>("/api/sensitivity", portfolioBody)
      .then((response) => { if (active) setSensitivity(response); })
      .catch((reason: Error) => { if (active) setSensitivityError(reason.message); });
    return () => { active = false; ++requestId.current; };
  }, [portfolioBody]);

  const weightTotal = Object.values(draft).reduce((sum, row) => sum + Number(row.weight), 0);
  const valid = Object.values(draft).every((row) => Object.values(row).every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0)) && weightTotal > 0;
  const dirty = JSON.stringify(draft) !== JSON.stringify(asDraft(applied));
  const run = async () => {
    if (!valid || !portfolioBody) return;
    const values: Assumptions = Object.fromEntries(Object.entries(draft).map(([name, row]) => [name, { pd_mult: Number(row.pd_mult), lgd_mult: Number(row.lgd_mult), weight: Number(row.weight) / weightTotal }]));
    const id = ++requestId.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await api.post<ScenarioResult>("/api/scenarios", { ...portfolioBody, config: { scenarios: values } });
      if (id !== requestId.current) return;
      setResult(response); setApplied(values); setDraft(asDraft(values));
      setNotice("Results updated. Applied weights sum to 100%.");
    } catch (reason) {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : "Could not run the stress test.");
    } finally { if (id === requestId.current) setBusy(false); }
  };
  const baseline = result?.scenario_ecl.Baseline ?? 0;
  const adverse = result?.scenario_ecl.Adverse ?? 0;
  const uplift = (result?.weighted_ecl ?? 0) - baseline;
  const maximum = Math.max(...Object.values(result?.scenario_ecl ?? {}), 1);
  const drivers = Object.entries(sensitivity?.factors ?? {}).flatMap(([factor, values]) => {
    const low = values.find((row) => Math.abs(row.shock + .2) < 1e-8);
    const high = values.find((row) => Math.abs(row.shock - .2) < 1e-8);
    return low && high ? [{ factor, low: low.ecl - sensitivity!.baseline, high: high.ecl - sensitivity!.baseline }] : [];
  }).sort((left, right) => right.high - left.high);
  const extent = Math.max(...drivers.flatMap((row) => [Math.abs(row.low), Math.abs(row.high)]), 1) * 1.1;
  const strongest = drivers.filter((row) => Math.abs(row.high - (drivers[0]?.high ?? 0)) <= .01).map((row) => row.factor);
  const driverInsight = drivers.length ? `${strongest.join(" and ")} ${strongest.length > 1 ? "tie for the largest" : "has the largest"} ECL increase under the +20% tests.` : "Sensitivity results are unavailable.";

  return <Box display="grid" gap={2.5}>
    <Box><Typography variant="overline" color="primary" fontWeight={800}>Scenario analysis</Typography><Typography component="h1" variant="h4" fontWeight={800}>Stress test</Typography><Typography color="text.secondary" mt={.5}>What happens to ECL when credit-risk assumptions change?</Typography></Box>
    {error && <ErrorPanel message={error} />}
    {!result && busy && <LoadingPanels count={4} />}
    {result && <>
      <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={2} aria-live="polite" aria-busy={busy}>
        <Metric title="Baseline ECL" value={currency(baseline)} note="Reference scenario for all comparisons." />
        <Metric title="Weighted ECL" value="" note="Probability-weighted portfolio outcome."><Explainable metricId="weighted_ecl" payload={{ ...result }} label="Weighted ECL"><Figure value={currency(result.weighted_ecl)} /></Explainable></Metric>
        <Metric title="Stress uplift" value={changePct(result.weighted_ecl, baseline)} note={`${signedMoney(uplift)} versus baseline`} highlight />
        <Metric title="Adverse ECL" value={currency(adverse)} note={`${changePct(adverse, baseline)} versus baseline`} />
      </Box>
      <Typography variant="body2" color="text.secondary">{dirty ? "Assumptions have changed. Results below reflect the last completed run." : "Results reflect the applied scenario assumptions."}{busy ? " Calculating updated results…" : ""}</Typography>
      <Panel title="Scenario impact" subtitle="Compare each scenario with baseline, then see the combined portfolio outcome.">
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", lg: "minmax(0, 1.6fr) minmax(0, 1fr)" }} gap={3}>
          <Stack spacing={2.5}>{Object.entries(result.scenario_ecl).map(([name, ecl]) => <Box key={name}>
            <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={.75}><Typography fontWeight={700}>{name}</Typography><Box display="flex" gap={1.5} alignItems="center"><Figure value={shortMoney(ecl)} variant="body1" /><Chip size="small" variant="outlined" label={name === "Baseline" ? "Reference" : changePct(ecl, baseline)} /></Box></Box>
            <Box aria-hidden height={20} bgcolor="grey.100" borderRadius={1} overflow="hidden"><Box height="100%" width={`${ecl / maximum * 100}%`} bgcolor={colors[name] ?? "#0E4B5A"} borderRadius={1} /></Box>
            <Typography variant="caption" color="text.secondary">Applied weight <Box component="span" display="inline-block"><Figure value={percent(result.weights[name])} variant="body2" /></Box></Typography>
          </Box>)}</Stack>
          <Box sx={{ bgcolor: "#F0F5F5", borderRadius: 2, p: 2.5 }}>
            <Typography variant="overline" color="primary" fontWeight={800}>Portfolio outcome</Typography><Figure value={shortMoney(result.weighted_ecl)} variant="h4" />
            <Typography variant="body2" mt={1}>Weighted ECL combines the scenarios using their applied probabilities.</Typography>
            <Box borderTop="1px solid" borderColor="divider" mt={2} pt={2}><Typography variant="subtitle2">Adverse scenario</Typography><Figure value={signedMoney(adverse - baseline)} variant="h6" /><Typography variant="body2" color="text.secondary" mt={.5}>Change from baseline with PD ×{applied.Adverse.pd_mult.toFixed(2)} and LGD ×{applied.Adverse.lgd_mult.toFixed(2)}. PD and LGD caps can limit the increase.</Typography></Box>
          </Box>
        </Box>
      </Panel>
    </>}
    {sensitivityError && <ErrorPanel message={sensitivityError} />}
    {!sensitivity && !sensitivityError && <LoadingPanels count={1} />}
    {sensitivity && <Panel title="What drives ECL sensitivity?" subtitle="Change in ECL from the unshocked portfolio. One driver moves by −20% or +20%, with the others fixed.">
      <Typography variant="body2" fontWeight={700} mb={2}>{driverInsight}</Typography>
      <Box display="grid" gridTemplateColumns="52px minmax(0, 1fr)" gap={1.5}>
        <Box /><Box display="flex" justifyContent="space-between"><Typography variant="caption">Lower ECL</Typography><Typography variant="caption">Baseline</Typography><Typography variant="caption">Higher ECL</Typography></Box>
        {drivers.map((row) => <Box key={row.factor} sx={{ display: "contents" }}><Typography alignSelf="center" fontWeight={700}>{row.factor}</Typography><Box>
          <Box height={34} position="relative" bgcolor="grey.50" aria-label={`${row.factor}: −20% changes ECL by ${signedMoney(row.low)}; +20% changes it by ${signedMoney(row.high)}`}>
            <Box position="absolute" top={0} bottom={0} left="50%" borderLeft="1px dashed" borderColor="text.secondary" />
            {[{ value: row.low, color: "#729B93" }, { value: row.high, color: "#0E4B5A" }].map(({ value, color }, index) => <Box key={index} position="absolute" top={6} height={22} left={`${50 + Math.min(value, 0) / extent * 50}%`} width={`${Math.abs(value) / extent * 50}%`} bgcolor={color} borderRadius={.5} />)}
          </Box><Box display="flex" justifyContent="space-between" gap={1}><Figure value={shortMoney(row.low)} variant="body2" /><Figure value={`${row.high > 0 ? "+" : ""}${shortMoney(row.high)}`} variant="body2" /></Box>
        </Box></Box>)}
      </Box>
      {!drivers.length && <Typography color="text.secondary">No −20% and +20% sensitivity results are available.</Typography>}
      <Typography variant="caption" color="text.secondary" display="block" mt={2}>Light teal: −20% shock. Dark teal: +20% shock. Ranked by the +20% ECL increase. Baseline ECL: {shortMoney(sensitivity.baseline)}. Sensitivity tests are independent of scenario weights.</Typography>
    </Panel>}
    {result && <Panel title="What the stress test tells us" subtitle="Interpretation of the applied assumptions for the current loan book."><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }} gap={3}>
      <Box><Typography fontWeight={700}>Downside exposure</Typography><Figure value={changePct(adverse, baseline)} variant="h6" /><Typography variant="body2" color="text.secondary">Adverse ECL change relative to the baseline scenario.</Typography></Box>
      <Box><Typography fontWeight={700}>Weighted expectation</Typography><Figure value={signedMoney(uplift)} variant="h6" /><Typography variant="body2" color="text.secondary">Additional ECL under the probability-weighted set. A negative value indicates a reduction.</Typography></Box>
      <Box><Typography fontWeight={700}>Primary sensitivity</Typography><Typography variant="body2" color="text.secondary" mt={.5}>{driverInsight} This is a comparison of tested assumptions, not a forecast.</Typography></Box>
    </Box></Panel>}
    <Panel title="Scenario assumptions" subtitle="Edit multipliers and relative weights, then run the stress test to update the results above.">
      <Box component="form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <Box overflow="auto"><Table size="small" aria-label="Scenario assumptions"><TableHead><TableRow><TableCell>Scenario</TableCell><TableCell>PD multiplier</TableCell><TableCell>LGD multiplier</TableCell><TableCell>Weight (%)</TableCell></TableRow></TableHead><TableBody>{Object.entries(draft).map(([name, row]) => <TableRow key={name}><TableCell sx={{ fontWeight: 700 }}>{name}</TableCell>{(["pd_mult", "lgd_mult", "weight"] as const).map((key) => <TableCell key={key}><TextField size="small" type="number" value={row[key]} disabled={busy} inputProps={{ "aria-label": `${name} ${key === "pd_mult" ? "PD multiplier" : key === "lgd_mult" ? "LGD multiplier" : "weight"}`, min: 0, step: "any" }} sx={{ minWidth: 110, maxWidth: 190 }} onChange={(event) => setDraft((previous) => ({ ...previous, [name]: { ...previous[name], [key]: event.target.value } }))} /></TableCell>)}</TableRow>)}</TableBody></Table></Box>
        <Typography variant="body2" role="status" color={valid ? Math.abs(weightTotal - 100) < .001 ? "success.main" : "warning.main" : "error.main"} mt={2}>{!valid ? "Enter non-negative numbers in every field and give at least one scenario a positive weight." : Math.abs(weightTotal - 100) < .001 ? "Weights total 100%. Ready to apply." : `Weights total ${weightTotal.toFixed(1)}%. They will be scaled proportionally to 100% when applied.`}</Typography>
        <Box display="flex" flexWrap="wrap" gap={1} mt={1.5}><Button type="submit" variant="contained" disabled={!valid || busy}>{busy ? "Running…" : "Run stress test"}</Button><Button disabled={busy} onClick={() => { setDraft(asDraft(defaults)); setNotice("Default assumptions restored. Run the stress test to apply them."); }}>Reset assumptions</Button></Box>
        {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
      </Box>
    </Panel>
    <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "12px !important", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon="+"><Typography fontWeight={700}>Methodology · Why isn't macro sensitivity shown?</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={1}><Typography variant="body2">Scenario ECL applies multipliers to each loan's stage-selected PD and LGD, then sums PD × LGD × EAD. PD is capped at 0.9999 and LGD at 1. Weighted ECL is the sum of each scenario's ECL multiplied by its normalised weight.</Typography><Typography variant="body2">{sensitivity?.note ?? "PD is calibrated from observed defaults rather than modelled directly from macroeconomic inputs. Macro sensitivity is therefore not estimated."}</Typography><Typography variant="body2">Sensitivity uses the unshocked portfolio as its reference, while scenario comparisons use the editable Baseline scenario. Small differences can arise from the PD cap. Results describe portfolio totals; regional and account contributions are not available in this view.</Typography></Stack></AccordionDetails>
    </Accordion>
  </Box>;
}

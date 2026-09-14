import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Box, Breadcrumbs, Button, Chip, Link, List, ListItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Borrower as BorrowerType, BorrowerWhatIf, PortfolioSummary } from "../types";
import { currency, ErrorPanel, LoadingPanels, percent, Panel, stageColors } from "../components/Common";
import { Explainable, Figure } from "../components/Explainable";
import { useDataSource, type RequestBody } from "../dataSource";

type Draft = { dpd: string; internal_score: string; pit_pd_12m: string };
const initialDraft = (data: BorrowerType): Draft => ({
  dpd: data.whatif_inputs.dpd === undefined ? "" : String(data.whatif_inputs.dpd),
  internal_score: data.whatif_inputs.internal_score === undefined ? "" : String(data.whatif_inputs.internal_score),
  pit_pd_12m: data.whatif_inputs.pit_pd_12m === undefined ? "" : String(Number((data.whatif_inputs.pit_pd_12m * 100).toFixed(4))),
});
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${currency(Math.abs(value))}`;
const signedNumber = (value: number, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
const changePercent = (before: number, after: number) => before > 0 ? `${signedNumber((after / before - 1) * 100, 1)}%` : after === 0 ? "0.0%" : "Not defined from zero";

function ContextList({ title, subtitle, lines }: { title: string; subtitle: string; lines: string[] }) {
  return <Panel title={title} subtitle={subtitle}>{lines.length ? <List dense disablePadding>{lines.map((line) => <ListItem key={line} disableGutters><Typography variant="body2">{line}</Typography></ListItem>)}</List> : <Typography variant="body2" color="text.secondary">No additional attributes supplied in this file.</Typography>}</Panel>;
}

function AccountProfile({ data, body, summary }: { data: BorrowerType; body: RequestBody; summary?: PortfolioSummary }) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(data));
  const [simulation, setSimulation] = useState<{ result: BorrowerWhatIf; inputs: Draft }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  useEffect(() => () => { ++requestId.current; }, []);
  const defaults = initialDraft(data);
  const dpd = data.whatif_inputs.dpd;
  const hasDpd = dpd !== undefined;
  const pdUsed = data.stage === 1 ? data.pd_12m : data.stage === 2 ? data.pd_lifetime : 1;
  const horizon = data.stage === 1 ? "12-month PD" : data.stage === 2 ? "Lifetime PD" : "PD of 100%";
  const payload = { ...data, pd_used: pdUsed };
  const aligned = data.stage === data.stage_rule;
  const stageReason = !hasDpd ? "A dpd column is needed to assess the delinquency thresholds."
    : data.stage_rule === 3 ? "The default flag or the 90-day delinquency threshold puts this account in Stage 3 under the rule."
    : data.stage_rule === 2 ? `${dpd} days past due lies between 30 and 89 days, triggering Stage 2 under the rule.`
    : `${dpd} days past due is below the 30-day Stage 2 threshold. The default rule is not triggered.`;
  const interpretation = hasDpd && data.stage_rule === 1
    ? `${30 - dpd} days below the 30-day Stage 2 threshold. Reaching that line would switch the rule to lifetime PD.`
    : stageReason;
  const economics = data.factor_context.filter((line) => /^(GDP growth|unemployment|interest rate):/i.test(line));
  const background = data.factor_context.filter((line) => !/days past due|^credit utilisation|^internal score:|^(GDP growth|unemployment|interest rate):/i.test(line));
  const utilisation = data.factor_context.find((line) => line.startsWith("credit utilisation"));
  const utilisationMatch = utilisation?.match(/^credit utilisation ([\d.]+), (.+)$/);
  const availableKeys = (Object.keys(draft) as (keyof Draft)[]).filter((key) => data.whatif_inputs[key] !== undefined);
  const valid = availableKeys.every((key) => draft[key].trim() !== "" && Number.isFinite(Number(draft[key])) && (key === "pit_pd_12m" ? Number(draft[key]) >= 0 && Number(draft[key]) <= 100 : key === "dpd" ? Number(draft[key]) >= 0 && Number.isInteger(Number(draft[key])) : true));
  const editedSinceRun = simulation && JSON.stringify(draft) !== JSON.stringify(simulation.inputs);
  const reset = () => { ++requestId.current; setDraft(defaults); setSimulation(undefined); setError(""); setBusy(false); };
  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !hasDpd) return;
    const overrides = Object.fromEntries(availableKeys.filter((key) => draft[key] !== defaults[key]).map((key) => [key, key === "pit_pd_12m" ? Number(draft[key]) / 100 : Number(draft[key])]));
    const id = ++requestId.current;
    setBusy(true); setError("");
    try {
      const result = await api.post<BorrowerWhatIf>("/api/borrower/whatif", { ...body, account_id: Number(data.identity.account_id), overrides });
      if (id === requestId.current) setSimulation({ result, inputs: { ...draft } });
    } catch (reason) { if (id === requestId.current) setError(reason instanceof Error ? reason.message : "Could not calculate this what-if."); }
    finally { if (id === requestId.current) setBusy(false); }
  };
  const comparison = simulation?.result;
  const difference = comparison ? comparison.after.ecl - comparison.before.ecl : 0;
  const measures = [
    { label: "ECL", value: currency(data.ecl), metric: "borrower_ecl", extra: {} },
    { label: "PD used for ECL", value: percent(pdUsed, 2), metric: "borrower_pd", extra: { value: pdUsed, formula: `PD used = ${horizon}, selected by the recorded stage` } },
    { label: "LGD", value: percent(data.lgd_used, 2), metric: "borrower_lgd", extra: {} },
    { label: "EAD", value: currency(data.ead_used), metric: "borrower_ead", extra: {} },
  ];
  return <Box display="grid" gap={2.5}>
    <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: 3, p: 2.5 }}>
      <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" mb={2}><Typography variant="h5" fontWeight={800}>Account {data.identity.account_id}</Typography><Chip label={`Recorded Stage ${data.stage}`} sx={{ color: "white", bgcolor: stageColors[data.stage] }} />{data.identity.region && <Chip variant="outlined" label={String(data.identity.region)} />}{data.identity.report_date && <Typography variant="caption" color="text.secondary">Reported {String(data.identity.report_date).slice(0, 10)}</Typography>}</Box>
      <Box display="grid" gridTemplateColumns={{ xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }} gap={2}>{measures.map((measure) => <Box key={measure.label}><Typography variant="body2" color="text.secondary">{measure.label}</Typography><Explainable metricId={measure.metric} label={measure.label} payload={{ ...payload, ...measure.extra }}><Figure value={measure.value} /></Explainable></Box>)}</Box>
      <Typography mt={2} fontWeight={700} color="primary.main">{interpretation}</Typography>
    </Box>

    <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2}>
      <Panel title="Stage assessment" subtitle="Compare the recorded stage with the delinquency and default rule.">
        <Box display="flex" gap={1} flexWrap="wrap" mb={2}><Chip label={`Recorded: Stage ${data.stage}`} variant="outlined" /><Chip label={hasDpd ? `Risk rule: Stage ${data.stage_rule}` : "Risk rule: DPD unavailable"} variant="outlined" /><Chip label={!hasDpd ? "Incomplete inputs" : aligned ? "Aligned" : "Review required"} color={!hasDpd || !aligned ? "warning" : "success"} size="small" /></Box>
        <Typography variant="subtitle2">Why this rule stage?</Typography><Typography variant="body2" color="text.secondary" mt={.5}>{stageReason}</Typography>
        {hasDpd && !aligned && <Alert severity="warning" sx={{ mt: 1.5 }}>Recorded and rule-based stages differ. The headline ECL uses the recorded stage; the what-if below uses the risk rule for both columns.</Alert>}
        <Typography variant="caption" display="block" mt={2}>Rule: default flag = 1 or DPD ≥ 90 → Stage 3; DPD 30–89 → Stage 2; otherwise Stage 1.</Typography>
      </Panel>
      <Panel title="Which PD feeds ECL?" subtitle={`${horizon} applies because the recorded account stage is ${data.stage}.`}>
        <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}><Box><Typography variant="body2" color="text.secondary">Calibrated 12-month PD</Typography><Figure value={percent(data.pd_12m, 2)} /><Typography variant="caption">{data.stage === 1 ? "Used in current ECL" : "12-month reference"}</Typography></Box><Box><Typography variant="body2" color="text.secondary">Lifetime PD</Typography><Figure value={percent(data.pd_lifetime, 2)} /><Typography variant="caption">{data.stage === 2 ? "Used in current ECL" : "Used when Stage 2 applies"}</Typography></Box></Box>
        <Box mt={2} p={1.5} bgcolor="#F0F5F5" borderRadius={1}><Typography variant="body2">ECL = PD used × LGD × EAD</Typography><Figure value={`${percent(pdUsed, 2)} × ${percent(data.lgd_used, 2)} × ${currency(data.ead_used)} ≈ ${currency(data.ecl)}`} variant="body2" /></Box>
      </Panel>
    </Box>

    <Panel title="Key risk signals" subtitle="Delinquency drives the risk rule. PD, LGD and EAD determine the loss calculation.">
      <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }} gap={2}>
        <Box><Typography fontWeight={700}>Days past due</Typography><Figure value={hasDpd ? `${dpd} days` : "Not supplied"} /><Typography variant="body2" color="text.secondary">{hasDpd && data.stage_rule === 1 ? `${30 - dpd} days to the Stage 2 threshold` : stageReason}</Typography></Box>
        <Box><Typography fontWeight={700}>Credit utilisation</Typography><Figure value={utilisationMatch ? percent(Number(utilisationMatch[1]), 0) : "Not supplied"} /><Typography variant="body2" color="text.secondary">{utilisationMatch?.[2] ?? ""}{utilisationMatch ? ". Context only; it does not change this calculation." : "Add credit_utilization to include this context."}</Typography></Box>
        <Box><Typography fontWeight={700}>Internal score</Typography><Figure value={data.whatif_inputs.internal_score === undefined ? "Not supplied" : String(data.whatif_inputs.internal_score)} /><Typography variant="body2" color="text.secondary">Context only. The current engine does not map scores to PD or stage.</Typography></Box>
      </Box>
    </Panel>

    <Panel title="Borrower what-if" subtitle="Compare the current risk-rule calculation with a change in delinquency or PD.">
      {!hasDpd ? <Typography color="text.secondary">Add a dpd column to unlock the borrower what-if.</Typography> : <>
        <Box component="form" onSubmit={apply}>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }} gap={2}>
            <TextField size="small" label="Days past due" type="number" value={draft.dpd} disabled={busy} inputProps={{ min: 0, step: 1 }} onChange={(event) => setDraft((prior) => ({ ...prior, dpd: event.target.value }))} helperText="30 days triggers Stage 2; 90 days triggers Stage 3." />
            {data.whatif_inputs.pit_pd_12m !== undefined && <TextField size="small" label="Input 12-month PD (%)" type="number" value={draft.pit_pd_12m} disabled={busy} inputProps={{ min: 0, max: 100, step: "any" }} onChange={(event) => setDraft((prior) => ({ ...prior, pit_pd_12m: event.target.value }))} helperText="Raw file PD, before portfolio calibration. Enter 25 for 25%." />}
            {data.whatif_inputs.internal_score !== undefined && <TextField size="small" label="Internal score" type="number" value={draft.internal_score} disabled={busy} inputProps={{ step: "any" }} onChange={(event) => setDraft((prior) => ({ ...prior, internal_score: event.target.value }))} helperText="Changing score alone does not affect PD, stage or ECL." />}
          </Box>
          {!valid && <Alert severity="warning" sx={{ mt: 1 }}>Enter valid numbers. DPD must be a non-negative whole number and PD must be between 0% and 100%.</Alert>}
          <Box display="flex" flexWrap="wrap" gap={1} mt={2}><Button type="submit" variant="contained" disabled={!valid || busy}>{busy ? "Calculating…" : "Apply what-if"}</Button><Button onClick={reset}>Reset</Button>{data.stage_rule === 1 && <Button disabled={busy} onClick={() => setDraft((prior) => ({ ...prior, dpd: "30" }))}>Try 30 DPD</Button>}</Box>
        </Box>
        {error && <Box mt={2}><ErrorPanel message={error} /></Box>}
        {comparison && simulation && <Box mt={2} aria-live="polite">
          {editedSinceRun && <Alert severity="info" sx={{ mb: 2 }}>Inputs have changed. Apply what-if to refresh this comparison.</Alert>}
          <Box p={2} bgcolor="#F0F5F5" borderRadius={2}><Typography fontWeight={800}>{comparison.before.stage === comparison.after.stage ? `The account stays in rule Stage ${comparison.after.stage}.` : `Rule Stage ${comparison.before.stage} → Stage ${comparison.after.stage}.`}</Typography><Figure value={`ECL change: ${signedMoney(difference)} (${changePercent(comparison.before.ecl, comparison.after.ecl)})`} variant="h6" /><Typography variant="body2" mt={.5}>Both columns use the same portfolio calibration, LGD and EAD. The applied DPD and input PD determine the result. The source file stays unchanged.</Typography></Box>
          <Box overflow="auto" mt={1}><Table size="small" aria-label="Borrower what-if comparison"><TableHead><TableRow><TableCell>Metric</TableCell><TableCell align="right">Current (risk rule)</TableCell><TableCell align="right">What-if</TableCell><TableCell align="right">Change</TableCell></TableRow></TableHead><TableBody>{[
            ["DPD", String(dpd), simulation.inputs.dpd, signedNumber(Number(simulation.inputs.dpd) - dpd!)],
            ["Stage", `Stage ${comparison.before.stage}`, `Stage ${comparison.after.stage}`, comparison.before.stage === comparison.after.stage ? "Unchanged" : "Stage changes"],
            ["PD used", percent(comparison.before.pd_used, 2), percent(comparison.after.pd_used, 2), `${signedNumber((comparison.after.pd_used - comparison.before.pd_used) * 100, 2)} pp`],
            ["ECL", currency(comparison.before.ecl), currency(comparison.after.ecl), signedMoney(difference)],
          ].map(([label, before, after, delta]) => <TableRow key={label}><TableCell>{label}</TableCell>{[before, after, delta].map((value, index) => <TableCell align="right" key={index}><Figure value={value} variant="body2" /></TableCell>)}</TableRow>)}</TableBody></Table></Box>
        </Box>}
      </>}
    </Panel>

    {summary && summary.n > 0 && <Panel title="Portfolio context" subtitle="A comparison with the whole current loan book, across all stages.">
      <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "1fr 1fr" }} gap={2}><Box><Typography variant="body2">Account 12-month PD / portfolio average</Typography><Figure value={`${percent(data.pd_12m, 2)} / ${percent(summary.avg_pd, 2)}`} variant="h6" /></Box><Box><Typography variant="body2">Account ECL / average ECL per account</Typography><Figure value={`${currency(data.ecl)} / ${currency(summary.total_ecl / summary.n)}`} variant="h6" /></Box></Box>
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>These are portfolio averages, not same-stage peer percentiles. Stage and exposure differences affect the comparison.</Typography>
    </Panel>}
    <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2}><ContextList title="Borrower context" subtitle="Descriptive attributes. These do not determine stage or ECL in this engine." lines={background} /><ContextList title="Economic context" subtitle="Values supplied in the file. They do not drive the calibrated PD or what-if." lines={economics} /></Box>
  </Box>;
}

export default function Borrower() {
  const { portfolioBody } = useDataSource();
  const location = useLocation();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState("");
  const [data, setData] = useState<BorrowerType>();
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const loadBorrower = useCallback(async (id: string) => {
    if (!portfolioBody) return;
    const token = ++requestId.current;
    setData(undefined); setError(""); setLoading(true);
    try {
      if (!id.trim() || !Number.isSafeInteger(Number(id))) throw new Error("Enter a whole-number account ID from your loan file.");
      const response = await api.post<BorrowerType>("/api/borrower", { ...portfolioBody, account_id: Number(id) });
      if (token === requestId.current) setData(response);
    } catch (reason) {
      if (token === requestId.current) setError(reason instanceof Error && /404|not found/i.test(reason.message) ? "Account not found. Check the ID in the current loan file and try again." : reason instanceof Error ? reason.message : "Could not load this account.");
    } finally { if (token === requestId.current) setLoading(false); }
  }, [portfolioBody]);
  useEffect(() => {
    const requestedId = new URLSearchParams(location.search).get("account_id");
    setData(undefined); setError(""); setAccountId(requestedId ?? "");
    if (requestedId) void loadBorrower(requestedId);
    return () => { ++requestId.current; };
  }, [location.search, loadBorrower]);
  useEffect(() => {
    if (!portfolioBody) return;
    let active = true; setSummary(undefined);
    void api.post<PortfolioSummary>("/api/portfolio/summary", portfolioBody).then((response) => { if (active) setSummary(response); }).catch(() => {});
    return () => { active = false; };
  }, [portfolioBody]);
  return <Box display="grid" gap={2.5}>
    <Box><Breadcrumbs sx={{ mb: 1 }}><Link component="button" underline="hover" onClick={() => navigate("/app/book")}>Portfolio</Link><Typography variant="body2">Account analysis</Typography>{data && <Typography variant="body2">{data.identity.account_id}</Typography>}</Breadcrumbs><Typography component="h1" variant="h4" fontWeight={800}>Account analysis</Typography><Typography color="text.secondary" mt={.5}>Understand this account's stage, expected loss and what could change them.</Typography></Box>
    <Box component="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void loadBorrower(accountId); }} display="flex" flexWrap="wrap" gap={1.5}><TextField label="Account ID" value={accountId} onChange={(event) => setAccountId(event.target.value)} required size="small" inputProps={{ inputMode: "numeric" }} /><Button type="submit" variant="contained" disabled={loading}>{loading ? "Searching…" : data ? "Search another account" : "Search"}</Button></Box>
    {loading && <LoadingPanels count={3} />}
    {error && <ErrorPanel message={error} />}
    {!loading && !data && !error && <Panel title="Choose an account to investigate" subtitle="Enter an ID from the current portfolio, or open an account from Early warning."><Typography color="text.secondary">Its recorded stage, risk-rule assessment, ECL inputs and what-if comparison will appear here.</Typography><Button sx={{ mt: 1 }} onClick={() => navigate("/app/watchlist")}>Open early warning</Button></Panel>}
    {data && portfolioBody && <AccountProfile key={String(data.identity.account_id)} data={data} body={portfolioBody} summary={summary} />}
  </Box>;
}

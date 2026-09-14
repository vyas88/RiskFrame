import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Drawer, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, ErrorPanel, LoadingPanels, Panel } from "../components/Common";
import { Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";
import type { Watchlist as WatchlistData } from "../types";

type WatchlistRow = NonNullable<WatchlistData["rows"]>[number];

function SummaryCard({ value, label, detail }: { value: string; label: string; detail: string }) {
  return <Panel title={label} subtitle={detail}><Figure value={value} /></Panel>;
}

export default function Watchlist() {
  const { portfolioBody } = useDataSource();
  const navigate = useNavigate();
  const [data, setData] = useState<WatchlistData>();
  const [error, setError] = useState("");
  const [minimumDpd, setMinimumDpd] = useState("25");
  const [sortBy, setSortBy] = useState<"impact" | "proximity">("impact");
  const [selected, setSelected] = useState<WatchlistRow>();
  useEffect(() => { api.post<WatchlistData>("/api/watchlist", portfolioBody).then(setData).catch((reason: Error) => setError(reason.message)); }, [portfolioBody]);
  const rows = data?.rows ?? [];
  const medianDpd = useMemo(() => { const sorted = [...rows].sort((left, right) => left.dpd - right.dpd); return sorted.length ? sorted[Math.floor(sorted.length / 2)].dpd : 0; }, [rows]);
  const displayedRows = useMemo(() => [...rows.filter((row) => row.dpd >= Number(minimumDpd))].sort((left, right) => sortBy === "impact" ? right.ecl_at_risk - left.ecl_at_risk : right.dpd - left.dpd), [rows, minimumDpd, sortBy]);
  const topRows = displayedRows.slice(0, 12);
  const topImpact = topRows.reduce((total, row) => total + row.ecl_at_risk, 0);
  const highestImpact = rows[0]?.ecl_at_risk ?? 0;

  if (error) return <ErrorPanel message={error} />;
  if (!data) return <LoadingPanels count={3} />;
  if (!data.available) return <Panel title="Early-warning watchlist" subtitle="This view identifies accounts just below the 30-day SICR line."><Typography color="text.secondary">Add a dpd column to unlock the early-warning watchlist.</Typography></Panel>;

  return <Box display="grid" gap={2.5}>
    <Box><Typography variant="overline" color="primary.main" fontWeight={800}>Action centre</Typography><Typography component="h1" variant="h4" fontWeight={800}>Early-warning watchlist</Typography><Typography color="text.secondary" mt={.5}>{data.n ?? 0} accounts are approaching the 30-day SICR threshold, representing {currency(data.total_ecl_at_risk ?? 0)} of potential lifetime ECL. Ranked by potential ECL impact if an account moves to Stage 2.</Typography></Box>

    <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(3, 1fr)" }} gap={2}>
      <SummaryCard value={(data.n ?? 0).toLocaleString()} label="Accounts approaching" detail="Stage 1 accounts within five days of the SICR line." />
      <SummaryCard value={currency(data.total_ecl_at_risk ?? 0)} label="Potential ECL at risk" detail="Additional lifetime ECL if these accounts move to Stage 2." />
      <SummaryCard value={currency(highestImpact)} label="Highest account impact" detail={`Largest single increase. Median watchlist DPD: ${medianDpd} days.`} />
    </Box>

    <Panel title="30-day SICR threshold" subtitle="Days past due are the reason these accounts appear on the watchlist."><Box display="grid" gridTemplateColumns="repeat(6, 1fr)" alignItems="end" gap={.75} maxWidth={620}>{[25, 26, 27, 28, 29, 30].map((day) => <Box key={day} textAlign="center"><Box height={day === 30 ? 42 : 26} borderRadius={1} bgcolor={day === 30 ? "error.main" : "warning.main"} sx={{ opacity: day === 30 ? 1 : .75 }} /><Typography variant="caption" fontWeight={day === 30 ? 800 : 500}>{day}</Typography>{day === 30 && <Typography variant="caption" display="block" color="error.main">Stage 2</Typography>}</Box>)}</Box></Panel>

    <Panel title="Account watchlist" subtitle={`Showing ${topRows.length} of ${displayedRows.length} matching accounts. Use an account to open its risk context.`}><Box display="flex" gap={1.5} flexWrap="wrap" mb={2}><FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id="minimum-dpd-label">Minimum DPD</InputLabel><Select labelId="minimum-dpd-label" label="Minimum DPD" value={minimumDpd} onChange={(event) => setMinimumDpd(event.target.value)}>{[25, 26, 27, 28, 29].map((day) => <MenuItem value={String(day)} key={day}>{day} days or more</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 205 }}><InputLabel id="watchlist-sort-label">Sort by</InputLabel><Select labelId="watchlist-sort-label" label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as "impact" | "proximity")}><MenuItem value="impact">ECL at risk, highest first</MenuItem><MenuItem value="proximity">Closest to Stage 2 first</MenuItem></Select></FormControl><Chip label="Stage 1 by rule" variant="outlined" /></Box><Typography variant="caption" color="text.secondary" display="block" mb={2}>The current watchlist API supplies DPD and ECL impact. Region and segment filters are not shown because those values are not available for these rows.</Typography><Box overflow="auto"><Table size="small" aria-label="Prioritised early-warning watchlist"><TableHead><TableRow><TableCell>Priority</TableCell><TableCell>Account</TableCell><TableCell>DPD</TableCell><TableCell>Days to SICR</TableCell><TableCell align="right">Current ECL</TableCell><TableCell align="right">Potential ECL</TableCell><TableCell align="right">ECL at risk</TableCell></TableRow></TableHead><TableBody>{topRows.map((row, index) => { const daysToSicr = 30 - row.dpd; return <TableRow key={row.account_id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}><TableCell><Chip size="small" color={index < 5 ? "error" : "warning"} label={index < 5 ? "High" : "Watch"} /></TableCell><TableCell><Button size="small" onClick={() => setSelected(row)} sx={{ fontWeight: 800, minWidth: 0 }}>{row.account_id}</Button></TableCell><TableCell><Box minWidth={94}><Typography variant="body2" fontWeight={800}>{row.dpd} days</Typography><Box height={5} borderRadius={999} bgcolor="grey.200" overflow="hidden" mt={.5}><Box height="100%" width={`${(row.dpd / 30) * 100}%`} bgcolor={daysToSicr <= 2 ? "error.main" : "warning.main"} /></Box></Box></TableCell><TableCell><Typography variant="body2" fontWeight={800}>{daysToSicr} day{daysToSicr === 1 ? "" : "s"}</Typography><Typography variant="caption" color="text.secondary">to threshold</Typography></TableCell><TableCell align="right"><Figure value={currency(row.current_ecl)} variant="body2" /></TableCell><TableCell align="right"><Figure value={currency(row.potential_ecl)} variant="body2" /></TableCell><TableCell align="right"><Figure value={currency(row.ecl_at_risk)} variant="body2" /></TableCell></TableRow>; })}</TableBody></Table></Box><Box display="flex" justifyContent="space-between" alignItems="center" mt={2}><Typography variant="caption" color="text.secondary">Top {topRows.length} accounts represent {currency(topImpact)} of potential ECL at risk.</Typography><Button size="small" onClick={() => setMinimumDpd("25")}>Reset filters</Button></Box></Panel>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(undefined)} PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 3 } }}>{selected && <Stack spacing={2}><Box display="flex" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="overline" color="primary.main" fontWeight={800}>Account signal</Typography><Typography variant="h5" fontWeight={800}>Account {selected.account_id}</Typography></Box><Button onClick={() => setSelected(undefined)}>Close</Button></Box><Chip color="warning" label={`Approaching Stage 2: ${selected.dpd} DPD`} sx={{ alignSelf: "flex-start" }} /><Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}><SummaryCard value={`${30 - selected.dpd} days`} label="Days to SICR" detail="Until the 30-day threshold." /><SummaryCard value={currency(selected.ecl_at_risk)} label="ECL at risk" detail="Increase if Stage 2 applies." /></Box><Panel title="Why this account is flagged" subtitle="Its DPD is close to the SICR threshold."><Typography variant="body2">If the account reaches 30 DPD, the calculation switches from a 12-month PD to lifetime PD. Potential ECL rises from {currency(selected.current_ecl)} to {currency(selected.potential_ecl)}.</Typography></Panel><Button variant="contained" onClick={() => navigate(`/app/borrower?account_id=${selected.account_id}`)}>Open full borrower view</Button></Stack>}</Drawer>
  </Box>;
}

import { useEffect, useState } from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { api } from "../api";
import { currency, ErrorPanel, LoadingPanels, Panel } from "../components/Common";
import { Figure } from "../components/Explainable";
import { useDataSource } from "../dataSource";
import type { Watchlist as WatchlistData } from "../types";

export default function Watchlist() {
  const { portfolioBody } = useDataSource();
  const [data, setData] = useState<WatchlistData>();
  const [error, setError] = useState("");
  useEffect(() => { api.post<WatchlistData>("/api/watchlist", portfolioBody).then(setData).catch((reason: Error) => setError(reason.message)); }, [portfolioBody]);
  if (error) return <ErrorPanel message={error} />;
  if (!data) return <LoadingPanels count={1} />;
  if (!data.available) return <Panel title="Early-warning watchlist" subtitle="This view identifies accounts just below the 30-day SICR line."><Typography color="text.secondary">Add a dpd column to unlock the early-warning watchlist.</Typography></Panel>;
  return <Panel title="Early-warning watchlist" subtitle={`${data.n ?? 0} accounts are one step from Stage 2, with ${currency(data.total_ecl_at_risk ?? 0)} of lifetime ECL at risk.`}><Box overflow="auto"><Table size="small"><TableHead><TableRow><TableCell>Account</TableCell><TableCell>DPD</TableCell><TableCell>Current ECL</TableCell><TableCell>Potential ECL</TableCell><TableCell>ECL at risk</TableCell></TableRow></TableHead><TableBody>{(data.rows ?? []).slice(0, 20).map((row) => <TableRow key={row.account_id}><TableCell><Figure value={String(row.account_id)} variant="body2" /></TableCell><TableCell><Figure value={String(row.dpd)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.current_ecl)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.potential_ecl)} variant="body2" /></TableCell><TableCell><Figure value={currency(row.ecl_at_risk)} variant="body2" /></TableCell></TableRow>)}</TableBody></Table></Box></Panel>;
}

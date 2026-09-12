import { FormEvent, useState } from "react";
import { Box, Button, Card, CardContent, List, ListItem, TextField, Typography } from "@mui/material";
import { api } from "../api";
import type { Borrower as BorrowerType } from "../types";
import { currency, ErrorPanel, percent, Panel } from "../components/Common";
import { useDataSource } from "../dataSource";

export default function Borrower() {
  const { portfolioBody } = useDataSource();
  const [accountId, setAccountId] = useState(""); const [data, setData] = useState<BorrowerType>(); const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); setError(""); api.post<BorrowerType>("/api/borrower", { ...portfolioBody, account_id: Number(accountId) }).then(setData).catch((err: Error) => setError(err.message.includes("404") || err.message.includes("not found") ? "Account not found" : err.message)); };
  const measures = data ? [["PD 12m", percent(data.pd_12m, 2)], ["PD lifetime", percent(data.pd_lifetime, 2)], ["LGD used", percent(data.lgd_used, 2)], ["EAD used", currency(data.ead_used)], ["ECL", currency(data.ecl)]] : [];
  return <Box display="grid" gap={2}><Panel title="Borrower view" subtitle="Inspect the PD, LGD, EAD, stage, and explanation for one account."><Box component="form" onSubmit={submit} display="flex" gap={1}><TextField label="Account ID" value={accountId} onChange={(e) => setAccountId(e.target.value)} required size="small" /><Button type="submit" variant="contained">Search</Button></Box></Panel>{error && <ErrorPanel message={error} />}{data && <><Box display="grid" gridTemplateColumns="repeat(auto-fit,minmax(160px,1fr))" gap={2}><Card><CardContent><Typography variant="body2">File stage</Typography><Typography variant="h5">Stage {data.stage}</Typography></CardContent></Card><Card><CardContent><Typography variant="body2">Rule stage</Typography><Typography variant="h5">Stage {data.stage_rule}</Typography><Typography variant="caption">{data.stage === data.stage_rule ? "Agrees with the file stage" : "Differs from the file stage"}</Typography></CardContent></Card>{measures.map(([label, value]) => <Card key={label}><CardContent><Typography variant="body2">{label}</Typography><Typography variant="h6">{value}</Typography></CardContent></Card>)}</Box><Panel title="Why this borrower" subtitle="Available borrower and loan attributes are shown in plain language."><List dense>{data.factor_context.map((line) => <ListItem key={line}>• {line}</ListItem>)}</List></Panel></>}</Box>;
}

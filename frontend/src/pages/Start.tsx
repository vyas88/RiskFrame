import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Divider, List, ListItem, Stack, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { parseCsv, type Row, useDataSource } from "../dataSource";
import type { DataQuality } from "../types";

const portfolioHeaders = ["account_id", "report_date", "pit_pd_12m", "stage", "default_flag"];
const lgdHeaders = ["ACCOUNT_ID", "EXPOSURE_AT_DEFAULT", "LGD_OBS"];
type ValidationMessage = { severity: "error" | "warning"; text: string };

function downloadTemplate(filename: string, headers: string[]) {
  const url = URL.createObjectURL(new Blob([`${headers.join(",")}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function qualityMessages(quality?: DataQuality): ValidationMessage[] {
  if (!quality) return [];
  return quality.checks.filter((check) => check.count > 0).flatMap<ValidationMessage>((check) => {
    if (check.check === "Missing required columns") return check.sample_ids.map((column) => ({ severity: "error" as const, text: `Column ${column} is missing. Add it for every loan using the format shown below.` }));
    if (check.check === "PD outside [0, 1]") return [{ severity: "error" as const, text: `${check.count} pit_pd_12m value${check.count === 1 ? " is" : "s are"} outside 0 to 1. Use a 12-month probability of default between 0 and 1 for each loan.` }];
    if (check.check === "Stage outside {1, 2, 3}") return [{ severity: "error" as const, text: `${check.count} stage value${check.count === 1 ? " is" : "s are"} invalid. Use only 1, 2, or 3.` }];
    if (check.check === "EAD is zero or negative") return [{ severity: "warning" as const, text: `${check.count} EAD value${check.count === 1 ? " is" : "s are"} zero or negative. Check the exposure or balance values.` }];
    if (check.check === "DPD is negative") return [{ severity: "warning" as const, text: `${check.count} DPD value${check.count === 1 ? " is" : "s are"} negative. Use zero or a positive number of days past due.` }];
    return [{ severity: "warning" as const, text: `${check.count} duplicate account ID${check.count === 1 ? " was" : "s were"} found. Confirm whether these rows should be distinct.` }];
  });
}

function CsvDrop({ label, description, required, onFile }: { label: string; description: string; required?: boolean; onFile: (file: File) => void }) {
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) onFile(file); };
  return <Box onDragOver={(event) => event.preventDefault()} onDrop={drop} sx={{ border: "1.5px dashed", borderColor: "primary.main", borderRadius: 3, p: 3, bgcolor: "#F8FBFC", textAlign: "center" }}><Typography fontWeight={800}>{label}{required ? " (required)" : ""}</Typography><Typography variant="body2" color="text.secondary" mt={.5}>{description}</Typography><Button component="label" variant="outlined" sx={{ mt: 2 }}>Choose a CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }} /></Button><Typography variant="caption" display="block" color="text.secondary" mt={1}>or drop the file here</Typography></Box>;
}

export default function Start() {
  const navigate = useNavigate();
  const location = useLocation();
  const { source, inlinePortfolioRows, useSample, useInlineData, addLgdData } = useDataSource();
  const [showUpload, setShowUpload] = useState(["lgd", "portfolio"].includes(new URLSearchParams(location.search).get("upload") ?? ""));
  const [portfolioRows, setPortfolioRows] = useState<Row[]>();
  const [portfolioFilename, setPortfolioFilename] = useState("");
  const [lgdRows, setLgdRows] = useState<Row[]>();
  const [lgdFilename, setLgdFilename] = useState("");
  const [quality, setQuality] = useState<DataQuality>();
  const [lgdErrors, setLgdErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const addLgdOnly = source === "inline" && Boolean(inlinePortfolioRows) && new URLSearchParams(location.search).get("upload") === "lgd";
  useEffect(() => { if (["lgd", "portfolio"].includes(new URLSearchParams(location.search).get("upload") ?? "")) setShowUpload(true); }, [location.search]);
  const messages = useMemo(() => qualityMessages(quality), [quality]);
  const blocked = Boolean(parseError) || quality?.status === "red" || lgdErrors.length > 0;
  const loadPortfolio = async (file: File) => { setLoading(true); setParseError(""); setQuality(undefined); try { const rows = await parseCsv(file); setPortfolioRows(rows); setPortfolioFilename(file.name); setQuality(await api.post<DataQuality>("/api/data-quality", { source: "inline", portfolio_rows: rows })); } catch (error) { setPortfolioRows(undefined); setParseError(error instanceof Error ? error.message : "This portfolio file could not be read."); } finally { setLoading(false); } };
  const loadLgd = async (file: File) => { setLoading(true); setLgdErrors([]); try { const rows = await parseCsv(file); const missing = lgdHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] ?? {}, header)); if (missing.length) { setLgdRows(undefined); setLgdErrors(missing.map((header) => `Column ${header} is missing. Add it to the recovery file for each account.`)); } else { setLgdRows(rows); setLgdFilename(file.name); } } catch (error) { setLgdRows(undefined); setLgdErrors([error instanceof Error ? error.message : "This recovery file could not be read."]); } finally { setLoading(false); } };
  const continueToApp = () => { if (addLgdOnly && lgdRows) { addLgdData(lgdRows, lgdFilename); navigate("/app/recoveries"); return; } if (!portfolioRows || blocked) return; useInlineData(portfolioRows, portfolioFilename, lgdRows, lgdFilename); navigate("/app/overview"); };
  const startSample = () => { useSample(); navigate("/app/overview"); };
  const uploadTitle = addLgdOnly ? "Add a recovery file" : "Upload your data";
  return <Box minHeight="100vh" bgcolor="#F4F6F8" py={{ xs: 5, md: 9 }}><Container maxWidth="md"><Box textAlign="center" mb={5}><Typography fontWeight={800} color="primary.main" letterSpacing=".1em" fontSize={12}>RISKFRAME</Typography><Typography component="h1" sx={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: { xs: "2.7rem", md: "3.7rem" }, lineHeight: 1.05, letterSpacing: "-.04em", mt: 1 }}>Start with the data you have.</Typography><Typography color="text.secondary" mt={1.5}>Choose a built-in example or bring your own loan file. Nothing is stored.</Typography></Box>
    {!addLgdOnly && <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2.5}><Card><CardContent sx={{ p: 3.5 }}><Typography variant="h5" fontWeight={800}>Use the sample data</Typography><Typography color="text.secondary" mt={1}>Explore RiskFrame with a built-in loan book and recovery file. Nothing to prepare.</Typography><Button variant="contained" fullWidth sx={{ mt: 3 }} onClick={startSample}>Load sample and continue</Button></CardContent></Card><Card><CardContent sx={{ p: 3.5 }}><Typography variant="h5" fontWeight={800}>Use your own data</Typography><Typography color="text.secondary" mt={1}>Upload your loan file. Your data stays in your browser and is never stored.</Typography><Button variant="outlined" fullWidth sx={{ mt: 3 }} onClick={() => setShowUpload(true)}>Upload a CSV</Button></CardContent></Card></Box>}
    {!addLgdOnly && <Box textAlign="center" mt={2.5}><Button onClick={() => { navigate("/"); window.setTimeout(() => document.getElementById("data")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} size="small">Not sure what a loan file needs? See the format</Button></Box>}
    {showUpload && <Card sx={{ mt: 4 }}><CardContent sx={{ p: { xs: 2.5, md: 4 } }}><Typography variant="h5" fontWeight={800}>{uploadTitle}</Typography><Typography color="text.secondary" mt={.5}>{addLgdOnly ? "The current portfolio stays in this browser session. Add a recovery file to unlock LGD analysis." : "Choose your portfolio first. A recovery file is optional."}</Typography><Stack gap={2.25} mt={3}>{!addLgdOnly && <><CsvDrop label="Portfolio CSV" required description="Your loan-level portfolio. This file is needed to calculate ECL." onFile={loadPortfolio} /><Button size="small" sx={{ alignSelf: "flex-start" }} onClick={() => downloadTemplate("riskframe-portfolio-template.csv", portfolioHeaders)}>Download a blank portfolio template</Button></>}<Divider /><CsvDrop label="LGD CSV" description="Optional. Adds recovery and LGD analysis." onFile={loadLgd} /><Button size="small" sx={{ alignSelf: "flex-start" }} onClick={() => downloadTemplate("riskframe-lgd-template.csv", lgdHeaders)}>Download a blank LGD template</Button></Stack>{loading && <Stack direction="row" spacing={1} alignItems="center" mt={3}><CircularProgress size={18} /><Typography variant="body2">Reading and checking your file.</Typography></Stack>}{portfolioRows && quality && !blocked && <Alert severity="success" sx={{ mt: 3 }}>Looks good. {portfolioRows.length.toLocaleString()} rows read.{messages.length ? " Some warnings are shown below." : ""}</Alert>}{parseError && <Alert severity="error" sx={{ mt: 3 }}>{parseError}</Alert>}{[...messages, ...lgdErrors.map((text) => ({ severity: "error" as const, text }))].length > 0 && <List sx={{ mt: 2, bgcolor: "#FFF8F7", borderRadius: 2 }}>{[...messages, ...lgdErrors.map((text) => ({ severity: "error" as const, text }))].map((message) => <ListItem key={message.text}><Typography variant="body2" color={message.severity === "error" ? "error.main" : "warning.dark"}>{message.text}</Typography></ListItem>)}</List>}<Button variant="contained" disabled={loading || blocked || (!addLgdOnly && !portfolioRows) || (addLgdOnly && !lgdRows)} onClick={continueToApp} sx={{ mt: 3 }}>{addLgdOnly ? "Add LGD file and continue" : "Continue"}</Button></CardContent></Card>}
  </Container></Box>;
}

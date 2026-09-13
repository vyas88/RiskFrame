import { lazy, Suspense, useEffect, useState } from "react";
import { AppBar, Box, Button, Chip, CircularProgress, CssBaseline, List, ListItem, Popover, Toolbar, Typography } from "@mui/material";
import { NavLink, Route, Routes } from "react-router-dom";
import { useDataSource } from "./dataSource";
import { ExplainDrawer } from "./components/Explainable";
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Borrower = lazy(() => import("./pages/Borrower"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Lgd = lazy(() => import("./pages/Lgd"));
const Report = lazy(() => import("./pages/Report"));

const links = [["Portfolio", "/"], ["Borrower", "/borrower"], ["Scenarios", "/scenarios"], ["LGD Analysis", "/lgd"], ["Report", "/report"]] as const;

function DataControls() {
  const { loadPortfolio, loadLgd, message, useSample, health } = useDataSource(); const [error, setError] = useState(""); const [healthAnchor, setHealthAnchor] = useState<HTMLElement | null>(null);
  const load = async (kind: "portfolio" | "lgd", file?: File) => { if (!file) return; try { setError(""); await (kind === "portfolio" ? loadPortfolio(file) : loadLgd(file)); } catch (err) { setError(err instanceof Error ? err.message : "Could not read CSV"); } };
  const healthColor = health?.status === "green" ? "success" : health?.status === "amber" ? "warning" : health?.status === "red" ? "error" : "default";
  const issues = health?.checks.filter((check) => check.count > 0) ?? [];
  return <Box display="flex" alignItems="center" gap={1} flexWrap="wrap"><Button component="label" color="inherit" size="small">Portfolio CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => load("portfolio", event.target.files?.[0])} /></Button><Button component="label" color="inherit" size="small">LGD CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => load("lgd", event.target.files?.[0])} /></Button><Button color="inherit" size="small" onClick={useSample}>Use sample</Button><Chip size="small" color={healthColor} label={`Data health: ${health?.status ?? "checking"}`} onClick={(event) => setHealthAnchor(event.currentTarget)} />{message && <Typography variant="caption">{message}</Typography>}{error && <Typography variant="caption" color="error.light">{error}</Typography>}<Popover open={Boolean(healthAnchor)} anchorEl={healthAnchor} onClose={() => setHealthAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}><Box p={2} maxWidth={340}><Typography variant="subtitle2">Data health</Typography>{!health && <Typography variant="body2">Checking the current portfolio.</Typography>}{health && (issues.length ? <List dense>{issues.map((issue) => <ListItem key={issue.check} disableGutters><Typography variant="body2">{issue.check}: {issue.count}{issue.sample_ids.length ? ` (accounts: ${issue.sample_ids.join(", ")})` : ""}</Typography></ListItem>)}</List> : <Typography variant="body2">No data-quality issues found.</Typography>)}</Box></Popover></Box>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <><CssBaseline /><AppBar position="static" elevation={0}><Toolbar sx={{ gap: 1, flexWrap: "wrap" }}><Box sx={{ mr: 2 }}><Typography variant="h6" fontWeight={800}>RiskFrame</Typography><Typography variant="caption">IFRS 9 Credit-Risk Analytics</Typography></Box>{links.map(([label, to]) => <Button key={to} component={NavLink} to={to} color="inherit">{label}</Button>)}<DataControls /></Toolbar></AppBar><Box component="main" maxWidth="xl" mx="auto" p={{ xs: 2, md: 3 }} width="100%">{!ready ? <Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box> : <Suspense fallback={<Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box>}><Routes><Route path="/" element={<Portfolio ready={ready} />} /><Route path="/borrower" element={<Borrower />} /><Route path="/scenarios" element={<Scenarios />} /><Route path="/lgd" element={<Lgd />} /><Route path="/report" element={<Report />} /></Routes></Suspense>}</Box><ExplainDrawer /></>;
}

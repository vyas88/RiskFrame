import { lazy, Suspense, useEffect, useState } from "react";
import { AppBar, Box, Button, CircularProgress, CssBaseline, Toolbar, Typography } from "@mui/material";
import { NavLink, Route, Routes } from "react-router-dom";
import { useDataSource } from "./dataSource";
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Borrower = lazy(() => import("./pages/Borrower"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Lgd = lazy(() => import("./pages/Lgd"));
const Report = lazy(() => import("./pages/Report"));

const links = [["Portfolio", "/"], ["Borrower", "/borrower"], ["Scenarios", "/scenarios"], ["LGD Analysis", "/lgd"], ["Report", "/report"]] as const;

function DataControls() {
  const { loadPortfolio, loadLgd, message, useSample } = useDataSource(); const [error, setError] = useState("");
  const load = async (kind: "portfolio" | "lgd", file?: File) => { if (!file) return; try { setError(""); await (kind === "portfolio" ? loadPortfolio(file) : loadLgd(file)); } catch (err) { setError(err instanceof Error ? err.message : "Could not read CSV"); } };
  return <Box display="flex" alignItems="center" gap={1} flexWrap="wrap"><Button component="label" color="inherit" size="small">Portfolio CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => load("portfolio", event.target.files?.[0])} /></Button><Button component="label" color="inherit" size="small">LGD CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => load("lgd", event.target.files?.[0])} /></Button><Button color="inherit" size="small" onClick={useSample}>Use sample</Button>{message && <Typography variant="caption">{message}</Typography>}{error && <Typography variant="caption" color="error.light">{error}</Typography>}</Box>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <><CssBaseline /><AppBar position="static" elevation={0}><Toolbar sx={{ gap: 1, flexWrap: "wrap" }}><Box sx={{ mr: 2 }}><Typography variant="h6" fontWeight={800}>RiskFrame</Typography><Typography variant="caption">IFRS 9 Credit-Risk Analytics</Typography></Box>{links.map(([label, to]) => <Button key={to} component={NavLink} to={to} color="inherit">{label}</Button>)}<DataControls /></Toolbar></AppBar><Box component="main" maxWidth="xl" mx="auto" p={{ xs: 2, md: 3 }} width="100%">{!ready ? <Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box> : <Suspense fallback={<Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box>}><Routes><Route path="/" element={<Portfolio ready={ready} />} /><Route path="/borrower" element={<Borrower />} /><Route path="/scenarios" element={<Scenarios />} /><Route path="/lgd" element={<Lgd />} /><Route path="/report" element={<Report />} /></Routes></Suspense>}</Box></>;
}

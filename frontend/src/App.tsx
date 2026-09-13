import { lazy, Suspense, useEffect, useState } from "react";
import { AppBar, Box, Button, Chip, CircularProgress, CssBaseline, List, ListItem, Popover, Toolbar, Typography } from "@mui/material";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useDataSource } from "./dataSource";
import { ExplainDrawer } from "./components/Explainable";

const Home = lazy(() => import("./pages/Home"));
const Start = lazy(() => import("./pages/Start"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Borrower = lazy(() => import("./pages/Borrower"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Lgd = lazy(() => import("./pages/Lgd"));
const Report = lazy(() => import("./pages/Report"));

const links = [["Home", "/"], ["Portfolio", "/app"], ["Borrower", "/borrower"], ["Scenarios", "/scenarios"], ["LGD Analysis", "/lgd"], ["Report", "/report"]] as const;

function DataControls() {
  const { activeLabel, clearData, health } = useDataSource();
  const navigate = useNavigate();
  const [healthAnchor, setHealthAnchor] = useState<HTMLElement | null>(null);
  const healthColor = health?.status === "green" ? "success" : health?.status === "amber" ? "warning" : health?.status === "red" ? "error" : "default";
  const issues = health?.checks.filter((check) => check.count > 0) ?? [];
  const changeData = () => { clearData(); navigate("/app"); };
  return <Box display="flex" alignItems="center" gap={1} flexWrap="wrap"><Chip size="small" variant="outlined" label={activeLabel} /><Button color="inherit" size="small" onClick={changeData}>Change data</Button><Chip size="small" color={healthColor} label={`Data health: ${health?.status ?? "checking"}`} onClick={(event) => setHealthAnchor(event.currentTarget)} /><Popover open={Boolean(healthAnchor)} anchorEl={healthAnchor} onClose={() => setHealthAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}><Box p={2} maxWidth={340}><Typography variant="subtitle2">Data health</Typography>{!health && <Typography variant="body2">No data-quality checks have run yet.</Typography>}{health && (issues.length ? <List dense>{issues.map((issue) => <ListItem key={issue.check} disableGutters><Typography variant="body2">{issue.check}: {issue.count}{issue.sample_ids.length ? ` (accounts: ${issue.sample_ids.join(", ")})` : ""}</Typography></ListItem>)}</List> : <Typography variant="body2">No data-quality issues found.</Typography>)}</Box></Popover></Box>;
}

function ConsoleShell({ ready }: { ready: boolean }) {
  const { source } = useDataSource();
  const location = useLocation();
  if (source === "none" || new URLSearchParams(location.search).get("upload") === "lgd") return <Start />;
  return <><AppBar position="static" elevation={0}><Toolbar sx={{ gap: 1, flexWrap: "wrap" }}><Box sx={{ mr: 2 }}><Typography variant="h6" fontWeight={800}>RiskFrame</Typography><Typography variant="caption">IFRS 9 Credit-Risk Analytics</Typography></Box>{links.map(([label, to]) => <Button key={to} component={NavLink} to={to} color="inherit">{label}</Button>)}<Button component="a" href="/learn.html" color="inherit">LEARN</Button><DataControls /></Toolbar></AppBar><Box component="main" maxWidth="xl" mx="auto" p={{ xs: 2, md: 3 }} width="100%">{!ready ? <Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box> : <Routes><Route path="/app" element={<Portfolio ready={ready} />} /><Route path="/borrower" element={<Borrower />} /><Route path="/scenarios" element={<Scenarios />} /><Route path="/lgd" element={<Lgd />} /><Route path="/report" element={<Report />} /></Routes>}</Box><ExplainDrawer /></>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const location = useLocation();
  useEffect(() => { setReady(true); }, []);
  return <><CssBaseline /><Suspense fallback={<Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box>}>{location.pathname === "/" ? <Home /> : <ConsoleShell ready={ready} />}</Suspense></>;
}

import { lazy, Suspense, useState } from "react";
import { AppBar, Box, Button, Chip, CircularProgress, CssBaseline, Drawer, FormControlLabel, IconButton, List, ListItemButton, ListItemText, Popover, Switch, Toolbar, Typography } from "@mui/material";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ExplainDrawer } from "./components/Explainable";
import { JourneyPage } from "./components/JourneyPage";
import { useDataSource } from "./dataSource";
import { JOURNEY_STEPS, useJourney } from "./state/JourneyContext";

const Home = lazy(() => import("./pages/Home"));
const Start = lazy(() => import("./pages/Start"));
const Overview = lazy(() => import("./pages/Overview"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Borrower = lazy(() => import("./pages/Borrower"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Lgd = lazy(() => import("./pages/Lgd"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Report = lazy(() => import("./pages/Report"));

const drawerWidth = 280;

function DataControls() {
  const { activeLabel, clearData, health } = useDataSource();
  const { guided, setGuided } = useJourney();
  const navigate = useNavigate();
  const [healthAnchor, setHealthAnchor] = useState<HTMLElement | null>(null);
  const healthColor = health?.status === "green" ? "success" : health?.status === "amber" ? "warning" : health?.status === "red" ? "error" : "default";
  const issues = health?.checks.filter((check) => check.count > 0) ?? [];
  return <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" justifyContent="flex-end"><Chip size="small" variant="outlined" label={activeLabel} /><Button color="inherit" size="small" onClick={() => { clearData(); navigate("/start"); }}>Change data</Button><Chip size="small" color={healthColor} label={`Data health: ${health?.status ?? "checking"}`} onClick={(event) => setHealthAnchor(event.currentTarget)} /><FormControlLabel sx={{ ml: 0 }} control={<Switch size="small" checked={guided} onChange={(_, checked) => setGuided(checked)} />} label={<Typography variant="caption">Guide me</Typography>} /><Popover open={Boolean(healthAnchor)} anchorEl={healthAnchor} onClose={() => setHealthAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}><Box p={2} maxWidth={340}><Typography variant="subtitle2">Data health</Typography>{!health && <Typography variant="body2">No data-quality checks have run yet.</Typography>}{health && (issues.length ? <List dense>{issues.map((issue) => <Typography key={issue.check} variant="body2" py={.5}>{issue.check}: {issue.count}{issue.sample_ids.length ? ` (accounts: ${issue.sample_ids.join(", ")})` : ""}</Typography>)}</List> : <Typography variant="body2">No data-quality issues found.</Typography>)}</Box></Popover></Box>;
}

function JourneyDrawer({ mobileOpen, closeMobile }: { mobileOpen: boolean; closeMobile: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasLgd } = useDataSource();
  const { steps } = useJourney();
  const isIncluded = (path: string) => steps.some((step) => step.path === path);
  const go = (path: string) => { navigate(path); closeMobile(); };
  const itemSx = (active: boolean) => ({ color: "common.white", borderLeft: "3px solid", borderColor: active ? "#E0A500" : "transparent", bgcolor: active ? "rgba(255,255,255,.1)" : "transparent", "&:hover": { bgcolor: "rgba(255,255,255,.12)" }, "&.Mui-disabled": { color: "rgba(255,255,255,.38)" } });
  const content = <Box sx={{ height: "100%", bgcolor: "#0B1F2A", color: "common.white", py: 2 }}><Box px={2.5} pb={2}><Typography fontWeight={800} variant="h6">RiskFrame</Typography><Typography variant="caption" color="rgba(255,255,255,.7)">IFRS 9 Credit-Risk Analytics</Typography></Box><Typography px={2.5} variant="overline" color="rgba(255,255,255,.58)">Start</Typography><List dense sx={{ py: .5 }}><ListItemButton sx={itemSx(location.pathname === "/")} onClick={() => go("/")}><ListItemText primary="Home" /></ListItemButton><ListItemButton sx={itemSx(location.pathname === "/start")} onClick={() => go("/start")}><ListItemText primary="Choose data" /></ListItemButton></List><Typography px={2.5} variant="overline" color="rgba(255,255,255,.58)">Explore</Typography><List dense sx={{ py: .5 }}>{JOURNEY_STEPS.map((step) => { const active = location.pathname === step.path; return <ListItemButton key={step.path} sx={itemSx(active)} disabled={step.optional && !hasLgd} onClick={() => isIncluded(step.path) && go(step.path)}><ListItemText primary={`${step.label}${active ? " · you are here" : ""}`} secondary={step.optional && !hasLgd ? "Needs an LGD file" : step.technical} secondaryTypographyProps={{ color: step.optional && !hasLgd ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.62)", variant: "caption" }} /></ListItemButton>; })}</List><Typography px={2.5} variant="overline" color="rgba(255,255,255,.58)">Help</Typography><List dense sx={{ py: .5 }}><ListItemButton sx={itemSx(false)} component="a" href="/learn.html"><ListItemText primary="How it works" secondary="Plain-language guide" secondaryTypographyProps={{ color: "rgba(255,255,255,.62)", variant: "caption" }} /></ListItemButton></List></Box>;
  return <><Drawer variant="permanent" open sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: drawerWidth, border: 0 } }}>{content}</Drawer><Drawer variant="temporary" open={mobileOpen} onClose={closeMobile} ModalProps={{ keepMounted: true }} sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: drawerWidth, border: 0 } }}>{content}</Drawer></>;
}

function ConsoleShell() {
  const { source, hasLgd } = useDataSource();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (source === "none") return <Navigate to="/start" replace />;
  return <Box display="flex" minHeight="100vh"><JourneyDrawer mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} /><Box sx={{ flexGrow: 1, ml: { md: `${drawerWidth}px` }, minWidth: 0 }}><AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}><Toolbar sx={{ gap: 1, flexWrap: "wrap", minHeight: { xs: 70, md: 78 } }}><IconButton onClick={() => setMobileOpen(true)} sx={{ display: { md: "none" } }} aria-label="Open navigation">☰</IconButton><Box sx={{ mr: "auto" }}><Typography fontWeight={800}>RiskFrame</Typography><Typography variant="caption" color="text.secondary">IFRS 9 Credit-Risk Analytics</Typography></Box><DataControls /></Toolbar></AppBar><Box component="main" maxWidth="xl" mx="auto" p={{ xs: 2, md: 3 }} width="100%"><Routes><Route path="/app" element={<Navigate to="/app/overview" replace />} /><Route path="/app/overview" element={<JourneyPage><Overview /></JourneyPage>} /><Route path="/app/book" element={<Portfolio ready />} /><Route path="/app/borrower" element={<JourneyPage><Borrower /></JourneyPage>} /><Route path="/app/stress" element={<JourneyPage><Scenarios /></JourneyPage>} /><Route path="/app/recoveries" element={hasLgd ? <JourneyPage><Lgd /></JourneyPage> : <Navigate to="/app/watchlist" replace />} /><Route path="/app/watchlist" element={<JourneyPage><Watchlist /></JourneyPage>} /><Route path="/app/report" element={<JourneyPage><Report /></JourneyPage>} /><Route path="*" element={<Navigate to="/app/overview" replace />} /></Routes></Box></Box><ExplainDrawer /></Box>;
}

export default function App() {
  return <><CssBaseline /><Suspense fallback={<Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box>}><Routes><Route path="/" element={<Home />} /><Route path="/start" element={<Start />} /><Route path="*" element={<ConsoleShell />} /></Routes></Suspense></>;
}

import { useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Container, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useDataSource } from "../dataSource";

type Column = { name: string; type: string; description: string };

const portfolioRequired: Column[] = [
  { name: "account_id", type: "integer", description: "unique loan or borrower id" },
  { name: "report_date", type: "date YYYY-MM-DD", description: "the reporting date" },
  { name: "pit_pd_12m", type: "number 0 to 1", description: "point-in-time 12-month probability of default" },
  { name: "stage", type: "integer 1 2 or 3", description: "the IFRS 9 stage" },
  { name: "default_flag", type: "integer 0 or 1", description: "whether the account is in default" },
];
const portfolioOptional: Column[] = [
  { name: "region", type: "text", description: "enables ECL by region" },
  { name: "dpd", type: "integer", description: "days past due; enables the staging rule, watchlist and what-if" },
  { name: "ead", type: "number", description: "exposure at default; if absent a configured default is used" },
  { name: "lgd", type: "number 0 to 1", description: "per-account LGD; if absent the LGD file or a default is used" },
  { name: "balance", type: "number", description: "used as EAD when ead is absent" },
  { name: "internal_score", type: "integer", description: "credit score; borrower context and what-if" },
  { name: "credit_utilization", type: "number", description: "utilisation ratio; borrower context" },
  { name: "age, employment_status, marital_status, dependents", type: "", description: "borrower context panel" },
  { name: "macro_gdp_growth, macro_unemployment, macro_interest_rate", type: "", description: "macro context" },
];
const lgdRequired: Column[] = [
  { name: "ACCOUNT_ID", type: "text", description: "id" },
  { name: "EXPOSURE_AT_DEFAULT", type: "number", description: "exposure; drives Total EAD and EAD-weighted LGD" },
  { name: "LGD_OBS", type: "number 0 to 1", description: "observed loss given default" },
];
const lgdOptional: Column[] = [
  { name: "RECOVERY_RATE", type: "number 0 to 1", description: "should equal 1 minus LGD_OBS" },
  { name: "LGD_MODEL_PRED", type: "number 0 to 1", description: "model-predicted LGD; enables the accuracy panel" },
  { name: "COLLATERAL_TYPE, SENIORITY, SECTOR, REGION, ECONOMIC_SEGMENT", type: "text", description: "segment breakdowns" },
  { name: "COLLATERAL_VALUE", type: "number", description: "enables the collateral effect" },
  { name: "LTV_RATIO", type: "number", description: "enables the LTV effect" },
  { name: "GUARANTEE_FLAG", type: "integer 0 or 1", description: "guarantee effect" },
  { name: "DAYS_PAST_DUE, INTEREST_RATE, RECOVERY_TIME_MONTHS, DEFAULT_FLAG", type: "", description: "extra context" },
];
const portfolioSampleHeaders = ["account_id", "report_date", "pit_pd_12m", "stage", "default_flag", "region", "dpd", "ead", "lgd", "balance", "internal_score", "credit_utilization"];
const lgdSampleHeaders = ["ACCOUNT_ID", "EXPOSURE_AT_DEFAULT", "LGD_OBS", "RECOVERY_RATE", "LGD_MODEL_PRED", "COLLATERAL_TYPE", "SENIORITY", "SECTOR", "REGION", "ECONOMIC_SEGMENT", "COLLATERAL_VALUE", "LTV_RATIO", "GUARANTEE_FLAG"];
const sectionSx = { py: { xs: 7, md: 10 } };
const eyebrowSx = { color: "primary.main", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" };
const displaySx = { fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 600, letterSpacing: "-0.04em", color: "#0B1F2A" };

function scrollToSection(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }

function Wordmark({ light = false }: { light?: boolean }) {
  const [showLogo, setShowLogo] = useState(true);
  return <Stack direction="row" spacing={1.25} alignItems="center">{showLogo && <Box component="img" src="/riskframe-logo.png" alt="" onError={() => setShowLogo(false)} sx={{ width: 34, height: 34, objectFit: "contain" }} />}<Box><Typography fontWeight={800} fontSize="1.12rem" color={light ? "common.white" : "#0B1F2A"}>RiskFrame</Typography><Typography variant="caption" display="block" color={light ? "rgba(255,255,255,.72)" : "text.secondary"} sx={{ lineHeight: 1.15 }}>Integrated Credit Risk Analytics Platform</Typography></Box></Stack>;
}

function ColumnTable({ rows }: { rows: Column[] }) {
  return <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Table size="small" sx={{ minWidth: 550 }}><TableHead><TableRow><TableCell>Column</TableCell><TableCell>Type or format</TableCell><TableCell>Purpose</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.name}><TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>{row.name}</TableCell><TableCell>{row.type}</TableCell><TableCell>{row.description}</TableCell></TableRow>)}</TableBody></Table></TableContainer>;
}

function SampleRow({ headers, values }: { headers: string[]; values: string[] }) {
  return <Box sx={{ overflowX: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Table size="small" sx={{ minWidth: 900 }}><TableHead><TableRow>{headers.map((header) => <TableCell key={header} sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{header}</TableCell>)}</TableRow></TableHead><TableBody><TableRow>{values.map((value, index) => <TableCell key={`${value}-${index}`} sx={{ whiteSpace: "nowrap" }}>{value}</TableCell>)}</TableRow></TableBody></Table></Box>;
}

function SchemaPanel({ title, required, optional, headers, values }: { title: string; required: Column[]; optional: Column[]; headers: string[]; values: string[] }) {
  return <Card sx={{ height: "100%" }}><CardContent sx={{ p: { xs: 2, md: 3 } }}><Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>{title}</Typography><Typography fontWeight={800} variant="body2" sx={{ mb: 1 }}>Required columns</Typography><Box sx={{ overflowX: "auto" }}><ColumnTable rows={required} /></Box><Accordion disableGutters elevation={0} sx={{ mt: 2, borderTop: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}><AccordionSummary expandIcon="+" aria-controls={`${title}-optional`} id={`${title}-optional-heading`}><Typography fontWeight={800}>Optional columns</Typography></AccordionSummary><AccordionDetails sx={{ px: 0 }}><Box sx={{ overflowX: "auto" }}><ColumnTable rows={optional} /></Box></AccordionDetails></Accordion><Typography fontWeight={800} variant="body2" sx={{ mt: 2, mb: 1 }}>One-row sample</Typography><SampleRow headers={headers} values={values} /></CardContent></Card>;
}

function ProductPreview() {
  const [showImage, setShowImage] = useState(true);
  if (showImage) return <Box component="img" src="/hero-dashboard.png" alt="RiskFrame portfolio dashboard" onError={() => setShowImage(false)} sx={{ width: "100%", borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "0 24px 50px rgba(11,31,42,.17)" }} />;
  return <Card sx={{ borderRadius: 3, boxShadow: "0 24px 50px rgba(11,31,42,.17)", overflow: "hidden" }}><Box sx={{ bgcolor: "#0E4B5A", color: "common.white", px: 2.5, py: 1.5, display: "flex", justifyContent: "space-between" }}><Typography fontWeight={800}>RiskFrame</Typography><Typography variant="caption">Example from the sample portfolio</Typography></Box><CardContent sx={{ p: { xs: 2.25, md: 3 } }}><Typography variant="caption" color="text.secondary">EXPECTED CREDIT LOSS</Typography><Typography sx={{ fontFamily: "monospace", fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, color: "primary.main", my: 1 }}>ECL = PD × LGD × EAD</Typography><Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={1.25} mt={2.5}>{[["Total ECL", "$15.77m"], ["Provision %", "31.53%"], ["Weighted stress", "$17.85m"]].map(([label, value]) => <Box key={label} sx={{ bgcolor: "#F4F6F8", p: 1.5, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} fontSize={{ xs: ".92rem", md: "1.1rem" }} sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography></Box>)}</Box></CardContent></Card>;
}

export default function Home() {
  const navigate = useNavigate();
  const { useSample } = useDataSource();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const listener = () => setScrolled(window.scrollY > 6); window.addEventListener("scroll", listener, { passive: true }); return () => window.removeEventListener("scroll", listener); }, []);
  const launch = () => navigate("/start");
  const launchSample = () => { useSample(); navigate("/app/overview"); };
  const workflow = [["1", "Input", "A loan portfolio CSV or the built-in sample."], ["2", "Scoring", "Each borrower's PD, calibrated to observed defaults."], ["3", "ECL", "Stages assigned, then PD × LGD × EAD per loan."], ["4", "Stress", "Scenarios shift PD and LGD, with ECL recomputed."], ["5", "Output", "A dashboard plus a plain-language report."]];
  return <Box sx={{ bgcolor: "#F4F6F8", color: "#1E2A36", minHeight: "100vh", "& *:focus-visible": { outline: "3px solid #E0A500", outlineOffset: 3 } }}>
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: "rgba(255,255,255,.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid", borderColor: scrolled ? "divider" : "transparent", transition: "border-color 180ms ease" }}><Container maxWidth="lg"><Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ minHeight: 76 }}><Wordmark /><Stack direction="row" spacing={.5} alignItems="center"><Box component="nav" aria-label="Home page" sx={{ display: { xs: "none", md: "flex" } }}><Button onClick={() => scrollToSection("how")}>How it works</Button><Button onClick={() => scrollToSection("data")}>Your data</Button><Button component="a" href="/learn.html">See how it works</Button></Box><Button variant="contained" onClick={launch} sx={{ whiteSpace: "nowrap", px: { xs: 1.5, sm: 2.25 } }}>Get started</Button></Stack></Stack></Container></Box>
    <Box component="main">
      <Container maxWidth="lg"><Box sx={{ ...sectionSx, pt: { xs: 7, md: 12 }, pb: { xs: 7, md: 11 }, animation: "homeReveal 420ms ease-out both", "@keyframes homeReveal": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } }, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1.02fr .98fr" }} gap={{ xs: 5, md: 7 }} alignItems="center"><Box><Typography sx={eyebrowSx}>Integrated credit risk analytics</Typography><Typography component="h1" sx={{ ...displaySx, fontSize: { xs: "3rem", sm: "4rem", md: "4.8rem" }, lineHeight: .98, mt: 1.5, mb: 2.5 }}>Credit risk, made explainable.</Typography><Typography color="text.secondary" sx={{ fontSize: { xs: "1.05rem", md: "1.2rem" }, maxWidth: 600, lineHeight: 1.65 }}>RiskFrame takes a lender's loan file all the way to an IFRS 9 provision, and explains every number on the way.</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={4}><Button variant="contained" size="large" onClick={launch}>Get started</Button><Button variant="outlined" size="large" onClick={launchSample}>Use sample data</Button></Stack></Box><ProductPreview /></Box></Box></Container>

      <Box sx={{ bgcolor: "common.white", borderTop: "1px solid", borderBottom: "1px solid", borderColor: "divider" }}><Container maxWidth="lg"><Box sx={sectionSx}><Typography sx={eyebrowSx}>What it offers</Typography><Typography component="h2" sx={{ ...displaySx, fontSize: { xs: "2.2rem", md: "3rem" }, mt: 1, mb: 4 }}>Everything needed to turn credit data into a decision-ready view.</Typography><Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={2}>{[["End to end", "From a loan file to a provision in one place, with no hand-offs."], ["Zero code", "Runs in a browser, with no notebook and no scripts."], ["Explained in plain language", "Every number opens a panel showing its formula and inputs."], ["Live stress testing", "Move a slider and the provision recomputes."]].map(([title, text]) => <Card key={title} variant="outlined" sx={{ boxShadow: "none" }}><CardContent><Typography variant="h6" fontWeight={800}>{title}</Typography><Typography variant="body2" color="text.secondary" mt={1}>{text}</Typography></CardContent></Card>)}</Box></Box></Container></Box>

      <Container maxWidth="lg"><Box component="section" id="how" sx={sectionSx}><Typography sx={eyebrowSx}>How it works</Typography><Typography component="h2" sx={{ ...displaySx, fontSize: { xs: "2.2rem", md: "3rem" }, mt: 1, mb: 4 }}>A clear path from loan file to report.</Typography><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(9, auto)" }} alignItems="center" gap={{ xs: 1, md: 0 }}>{workflow.flatMap(([number, title, text], index) => [<Card key={title} variant="outlined" sx={{ width: { md: 178 }, boxShadow: "none" }}><CardContent><Typography color="primary.main" fontWeight={800}>{number}</Typography><Typography variant="h6" fontWeight={800} mt={.5}>{title}</Typography><Typography variant="body2" color="text.secondary" mt={.75}>{text}</Typography></CardContent></Card>, index < 4 ? <Typography key={`arrow-${title}`} aria-hidden="true" sx={{ color: "primary.main", fontWeight: 800, fontSize: { xs: "1.35rem", md: "1.5rem" }, transform: { xs: "rotate(90deg)", md: "none" }, textAlign: "center", px: { md: 1 } }}>→</Typography> : null])}</Box></Box></Container>

      <Box sx={{ bgcolor: "#0B1F2A", color: "common.white" }}><Container maxWidth="lg"><Box sx={sectionSx}><Typography sx={{ ...eyebrowSx, color: "#E0A500" }}>Why not a BI dashboard</Typography><Typography component="h2" sx={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: { xs: "2.2rem", md: "3rem" }, lineHeight: 1.1, mt: 1, mb: 4 }}>The calculation is the product, not a chart around it.</Typography><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }} gap={3}>{[["Capability", "Real IFRS 9 computation, not just charts."], ["Approachability", "Built for small lenders and learners, with no data team."], ["Transparency", "Plain-language reasoning behind every figure."]].map(([title, text]) => <Box key={title} sx={{ borderTop: "1px solid rgba(255,255,255,.3)", pt: 2 }}><Typography fontWeight={800}>{title}</Typography><Typography color="rgba(255,255,255,.72)" mt={.75}>{text}</Typography></Box>)}</Box><Typography fontWeight={800} color="#E0A500" mt={5}>Tableau starts where RiskFrame ends.</Typography></Box></Container></Box>

      <Container maxWidth="lg"><Box component="section" id="data" sx={sectionSx}><Typography sx={eyebrowSx}>Your data</Typography><Typography component="h2" sx={{ ...displaySx, fontSize: { xs: "2.2rem", md: "3rem" }, mt: 1, mb: 1.5 }}>A simple two-file input.</Typography><Typography color="text.secondary" sx={{ maxWidth: 700, mb: 4 }}>RiskFrame reads two CSV files. Nothing is stored, everything runs in memory for your session.</Typography><Box display="grid" gridTemplateColumns={{ xs: "1fr", lg: "1fr 1fr" }} gap={2.5}><SchemaPanel title="Portfolio file" required={portfolioRequired} optional={portfolioOptional} headers={portfolioSampleHeaders} values={["1042", "2025-07-01", "0.031", "1", "0", "North", "12", "10000", "0.45", "8500", "720", "0.34"]} /><SchemaPanel title="LGD file" required={lgdRequired} optional={lgdOptional} headers={lgdSampleHeaders} values={["A0001", "523560", "0.532", "0.468", "0.523", "Mortgage", "Senior", "SME", "South", "Near-Prime", "100588", "3.0", "0"]} /></Box><Typography variant="body2" color="text.secondary" mt={2.5}>Only the required columns must be present. Optional columns unlock extra views. Or click <Button size="small" onClick={launchSample} sx={{ minWidth: 0, p: 0, verticalAlign: "baseline" }}>Use sample data</Button> to explore with a built-in file.</Typography></Box></Container>

      <Box sx={{ bgcolor: "#EAF3F3", borderTop: "1px solid", borderColor: "divider" }}><Container maxWidth="lg"><Box sx={{ py: 4 }}><Typography color="text.secondary">Retail lending, IFRS 9 expected credit loss with staging and stress testing. Nothing is stored, no login. See what this <Button component="a" href="/learn.html#limits" size="small" sx={{ minWidth: 0, p: 0, verticalAlign: "baseline" }}>does and does not claim</Button>.</Typography></Box></Container></Box>
    </Box>
    <Box component="footer" sx={{ bgcolor: "#0B1F2A", color: "common.white", py: 5 }}><Container maxWidth="lg"><Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1.5fr 1fr 1fr" }} gap={4}><Wordmark light /><Box><Typography variant="body2">MCAI581-3 Capstone Project, MS Computational Statistics and Applied AI</Typography><Typography variant="body2" color="rgba(255,255,255,.72)" mt={1}>Ronit Vyas 2548607</Typography><Typography variant="body2" color="rgba(255,255,255,.72)">Guide: Mr. Vikas K</Typography><Typography variant="body2" color="rgba(255,255,255,.72)">CHRIST (Deemed to be University), Bangalore</Typography></Box><Stack alignItems={{ xs: "flex-start", md: "flex-end" }} spacing={1}><Button onClick={launch} color="inherit">Get started</Button><Button component="a" href="/learn.html" color="inherit">See how it works</Button><Button onClick={() => scrollToSection("data")} color="inherit">Your data</Button></Stack></Box></Container></Box>
  </Box>;
}

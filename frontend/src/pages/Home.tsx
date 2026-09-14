import { useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Container, Stack, Alert, Skeleton, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useDataSource } from "../dataSource";
import { api } from "../api";
import type { PortfolioSummary } from "../types";
import { Figure } from "../components/Explainable";
import { stageColors } from "../components/Common";

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
  { name: "balance", type: "number", description: "used as EAD when the balance source is selected" },
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

const sectionSx = { py: { xs: 5, md: 7 }, scrollMarginTop: 100 };
const eyebrowSx = { color: "primary.main", fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" };
const displaySx = { fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 600, letterSpacing: "-.035em", color: "#0B1F2A", lineHeight: 1.12 };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
}

function SchemaPanel({ title, description, required, optional }: { title: string; description: string; required: Column[]; optional: Column[] }) {
  return <Card variant="outlined" sx={{ borderRadius: 2, boxShadow: "none", minWidth: 0 }}>
    <CardContent sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={800}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" mt={.5} mb={2}>{description}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={.75}>
        {required.map((column) => <Box component="code" key={column.name} sx={{ bgcolor: "#EEF3F3", color: "primary.main", p: .75, borderRadius: 1, fontSize: 12, overflowWrap: "anywhere" }}>{column.name}</Box>)}
      </Stack>
      <Accordion disableGutters elevation={0} sx={{ mt: 2, "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon="+"><Typography variant="body2" fontWeight={700}>View full data schema</Typography></AccordionSummary>
        <AccordionDetails sx={{ px: 0 }}>
          {[["Required", required], ["Optional", optional]].map(([label, columns]) => <Box key={label as string} mb={2}>
            <Typography variant="overline" fontWeight={800}>{label as string}</Typography>
            <Box component="dl" m={0}>{(columns as Column[]).map((column) => <Box key={column.name} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography component="dt" sx={{ fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere", fontWeight: 700 }}>{column.name}</Typography>
              <Typography component="dd" variant="body2" color="text.secondary" m={0}>{column.type}{column.type ? ": " : ""}{column.description}</Typography>
            </Box>)}</Box>
          </Box>)}
        </AccordionDetails>
      </Accordion>
    </CardContent>
  </Card>;
}

// Preview uses the same stateless sample request as the console, never the visitor's active file.
function ProductPreview() {
  const [summary, setSummary] = useState<PortfolioSummary>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void api.post<PortfolioSummary>("/api/portfolio/summary", { source: "sample" })
      .then((result) => { if (active) setSummary(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <Box component="figure" m={0} sx={{ minWidth: 0 }}>
    <Box sx={{ border: "1px solid #DCE5E5", borderRadius: 2, overflow: "hidden", bgcolor: "white", boxShadow: "0 18px 50px rgba(11,31,42,.08)" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, bgcolor: "#0B1F2A", color: "white" }}>
        <Typography fontWeight={800} variant="body2">RiskFrame / Overview</Typography>
        <Typography variant="caption" sx={{ color: "#D9E7E8" }}>Sample data</Typography>
      </Stack>
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="overline" color="primary.main" fontWeight={800}>Portfolio at a glance</Typography>
        {error ? <Alert severity="info">Sample preview is unavailable. You can still upload your own file or try the sample in the app.</Alert> : !summary ? <Box aria-label="Loading sample preview"><Skeleton height={90} /><Skeleton height={120} /></Box> : <>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2} mt={1} mb={3}>
            {[["Total EAD", money(summary.total_ead)], ["Expected Credit Loss", money(summary.total_ecl)], ["Provision rate", (summary.provision_pct * 100).toFixed(2) + "%"], ["Accounts", summary.n.toLocaleString("en-US")]].map(([label, value]) => <Box key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Figure value={value} variant="h6" />
            </Box>)}
          </Box>
          <Typography variant="body2" fontWeight={700} mb={1}>Where the risk sits</Typography>
          <Stack gap={1.25}>{summary.stage_mix.map((stage) => <Box key={stage.stage}>
            <Stack direction="row" justifyContent="space-between" mb={.5}><Typography variant="caption">Stage {stage.stage}</Typography><Figure variant="body2" value={(stage.share * 100).toFixed(1) + "%"} /></Stack>
            <Box sx={{ height: 6, bgcolor: "#EFF3F3", borderRadius: 1 }}><Box sx={{ height: "100%", width: stage.share * 100 + "%", bgcolor: stageColors[stage.stage], borderRadius: 1 }} /></Box>
          </Box>)}</Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>Account shares by stage · ECL = PD × LGD × EAD</Typography>
        </>}
      </Box>
    </Box>
    <Typography component="figcaption" variant="caption" color="text.secondary" textAlign="center" mt={1.5}>Live example from the bundled sample. Your file produces its own results.</Typography>
  </Box>;
}

export default function Home() {
  const navigate = useNavigate();
  const { useSample } = useDataSource();
  const launchSample = () => { useSample(); navigate("/app/overview"); };
  const upload = () => navigate("/start?upload=portfolio");
  const workflow = [
    ["Input", "Choose a sample or upload a loan-level CSV."],
    ["Calibration", "Scale supplied PD to observed defaults when enabled."],
    ["Stage & ECL", "Apply the file stage and calculate PD × LGD × EAD."],
    ["Stress", "Adjust assumptions and compare scenario outcomes."],
    ["Report", "Download results with plain-language explanations."],
  ];
  const actions = <Stack direction={{ xs: "column", sm: "row" }} gap={1.25}>
    <Button variant="contained" onClick={launchSample}>Explore sample portfolio</Button>
    <Button variant="outlined" onClick={upload}>Upload your data</Button>
  </Stack>;
  return <Box sx={{ bgcolor: "#F7F8F6", color: "#1E2A36", "& .MuiButton-root": { textTransform: "none", fontWeight: 700 }, "& *:focus-visible": { outline: "3px solid #E0A500", outlineOffset: 3 } }}>
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: "#0B1F2A", color: "white" }}>
      <Container maxWidth="lg">
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} py={1.75}>
          <Box><Typography fontWeight={800} fontSize={20}>RiskFrame</Typography><Typography variant="caption" color="#B8C8CD" sx={{ display: { xs: "none", sm: "block" } }}>Integrated Credit Risk Analytics</Typography></Box>
          <Stack component="nav" aria-label="Home page" direction="row" gap={.5} alignItems="center">
            <Button color="inherit" sx={{ display: { xs: "none", md: "inline-flex" }, fontSize: 13 }} onClick={() => scrollToSection("how")}>Workflow</Button>
            <Button color="inherit" sx={{ display: { xs: "none", sm: "inline-flex" }, fontSize: 13 }} onClick={() => scrollToSection("data")}>Your data</Button>
            <Button color="inherit" component="a" href="/learn.html" sx={{ fontSize: 13 }}>Learn</Button>
            <Button variant="contained" onClick={() => navigate("/start")} sx={{ ml: 1 }}>Launch app</Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
    <Box component="main">
      <Container maxWidth="lg">
        <Box component="section" sx={{ ...sectionSx, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" }, alignItems: "center", gap: { xs: 4, md: 6 } }}>
          <Box>
            <Typography sx={eyebrowSx}>Calculation-first credit analytics</Typography>
            <Typography component="h1" sx={{ ...displaySx, fontSize: { xs: "2.8rem", sm: "3.4rem", md: "3.7rem" }, mt: 1.5, mb: 2 }}>Credit risk,<br />made explainable.</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 17, lineHeight: 1.7, mb: 3 }}>Turn loan-level data into IFRS 9 staging analysis, ECL, stress testing, and plain-language insight in one browser-based workflow.</Typography>
            {actions}
            <Typography variant="caption" color="text.secondary" display="block" mt={2}>No login · No database · Session-only processing</Typography>
          </Box>
          <ProductPreview />
        </Box>
      </Container>
      <Box sx={{ bgcolor: "white", borderBlock: "1px solid #E2E8E7" }}>
        <Container maxWidth="lg"><Box component="section" sx={sectionSx}>
          <Typography sx={eyebrowSx}>What RiskFrame does</Typography>
          <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 3 }}>From exposure to an explainable result.</Typography>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }} gap={3}>
            {[
              ["01", "Core engine", "A transparent loss calculation.", "PD calibration, stage-specific horizons, and PD × LGD × EAD."],
              ["02", "Analysis", "Explore what changes the outcome.", "Scenario stress, borrower what-if, recoveries, and early warning."],
              ["03", "Explainability", "Follow the inputs behind the result.", "Formula drawers for key metrics and a downloadable narrative report."],
            ].map(([number, title, text, detail]) => <Box key={title} sx={{ borderTop: "2px solid #D8E5E5", pt: 2 }}>
              <Typography variant="caption" fontWeight={800} color="primary.main">{number} / {title}</Typography>
              <Typography variant="h6" fontWeight={700} my={1}>{text}</Typography>
              <Typography variant="body2" color="text.secondary">{detail}</Typography>
            </Box>)}
          </Box>
        </Box></Container>
      </Box>
      <Container maxWidth="lg"><Box component="section" id="how" sx={sectionSx}>
        <Typography sx={eyebrowSx}>How it works</Typography>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 3 }}>One workflow. Visible assumptions.</Typography>
        <Box component="ol" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(5, minmax(0, 1fr))" }, p: 0, m: 0, listStyle: "none", gap: { xs: 2, sm: 0 } }}>
          {workflow.map(([title, text], index) => <Box component="li" key={title} sx={{ position: "relative", pr: { sm: 2 }, "&:not(:last-child):after": { content: '""', display: { xs: "none", sm: "block" }, position: "absolute", height: "1px", bgcolor: "#CFDDDD", top: 15, left: 32, right: 0 } }}>
            <Box sx={{ width: 30, height: 30, border: "1px solid #BDD2D3", borderRadius: "50%", display: "grid", placeItems: "center", color: "primary.main", fontSize: 12, fontWeight: 800 }}>{index + 1}</Box>
            <Typography fontWeight={700} mt={1.5}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>{text}</Typography>
          </Box>)}
        </Box>
      </Box></Container>
      <Box sx={{ bgcolor: "#0B1F2A", color: "white" }}><Container maxWidth="lg"><Box sx={sectionSx}>
        <Typography sx={{ ...eyebrowSx, color: "#E0A500" }}>Why RiskFrame</Typography>
        <Typography component="h2" sx={{ ...displaySx, color: "white", fontSize: { xs: 30, md: 40 }, maxWidth: 850, mt: 1, mb: 2 }}>The calculation is the product, not a chart around it.</Typography>
        <Typography color="#BACACF" maxWidth={730}>Designed to complement BI tools, not imitate them. RiskFrame puts transparent credit-risk calculations first, with a lightweight interface for exploring their meaning.</Typography>
        <Button component="a" href="/learn.html#limits" color="inherit" sx={{ mt: 2, px: 0 }}>Understand the methods and limitations →</Button>
      </Box></Container></Box>
      <Container maxWidth="lg"><Box component="section" id="data" sx={sectionSx}>
        <Typography sx={eyebrowSx}>Your data</Typography>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 1 }}>One loan file. Optional recovery data.</Typography>
        <Typography color="text.secondary" maxWidth={750} mb={3}>CSV files are parsed in your browser and sent for in-memory calculation per request. No uploaded data is stored on the server. Required headers are shown below; extra columns unlock more analysis.</Typography>
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2}>
          <SchemaPanel title="Portfolio file" description="Required. One row per account, with PD and stage." required={portfolioRequired} optional={portfolioOptional} />
          <SchemaPanel title="LGD file" description="Optional. Recovery observations to inform the LGD assumption. Preserve uppercase headers." required={lgdRequired} optional={lgdOptional} />
        </Box>
      </Box></Container>
      <Box sx={{ bgcolor: "#EAF1F0", borderTop: "1px solid #DCE5E5" }}><Container maxWidth="lg"><Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "stretch", md: "center" }} justifyContent="space-between" gap={3} py={4}>
        <Box><Typography component="h2" sx={{ ...displaySx, fontSize: 30 }}>See the calculation for yourself.</Typography><Typography variant="body2" color="text.secondary" mt={1}>Start with the sample or bring your own portfolio.</Typography></Box>
        {actions}
      </Stack></Container></Box>
    </Box>
    <Box component="footer" sx={{ bgcolor: "#0B1F2A", color: "white", py: 2.5 }}><Container maxWidth="lg"><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
      <Typography variant="body2"><strong>RiskFrame</strong> · Explainable credit-risk analytics</Typography>
      <Stack direction="row" gap={1}><Button color="inherit" onClick={() => scrollToSection("data")}>Data format</Button><Button color="inherit" component="a" href="/learn.html">Learning guide</Button></Stack>
    </Stack></Container></Box>
  </Box>;
}

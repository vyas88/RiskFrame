import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Container, Stack, Typography } from "@mui/material";
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

function DecisionQuestions() {
  const questions = [
    "Where is risk beginning to build?",
    "Which exposures deserve attention first?",
    "What happens if conditions deteriorate?",
    "Can we explain the decision?",
  ];
  return <Box component="section" aria-labelledby="decision-questions" sx={{ minWidth: 0, border: "1px solid #DCE5E5", borderRadius: 2, overflow: "hidden", bgcolor: "white", boxShadow: "0 18px 50px rgba(11,31,42,.06)" }}>
    <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 2.5, bgcolor: "#0B1F2A" }}>
      <Typography component="h2" id="decision-questions" sx={{ ...eyebrowSx, color: "#D4E4E7" }}>From risk signal to decision</Typography>
    </Box>
    <Box component="ol" sx={{ listStyle: "none", m: 0, px: { xs: 2.5, sm: 3 }, py: 1 }}>
      {questions.map((question, index) => <Box component="li" key={question} sx={{ display: "flex", gap: 2, py: 3, alignItems: "baseline", "&:not(:last-child)": { borderBottom: "1px solid #E4EBEB" } }}>
        <Typography component="span" aria-hidden="true" sx={{ fontSize: 12, fontWeight: 700, color: "primary.main" }}>{String(index + 1).padStart(2, "0")}</Typography>
        <Typography sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 600, lineHeight: 1.4 }}>{question}</Typography>
      </Box>)}
    </Box>
    <Typography variant="body2" color="text.secondary" sx={{ px: { xs: 2.5, sm: 3 }, pb: 3 }}>One connected view from portfolio to borrower.</Typography>
  </Box>;
}

export default function Home() {
  const navigate = useNavigate();
  const { useSample } = useDataSource();
  const launchSample = () => { useSample(); navigate("/app/overview"); };
  const upload = () => navigate("/start?upload=portfolio");
  const workflow = [
    ["Input", "Upload a portfolio, add optional recovery data, or explore the sample."],
    ["Assess", "Review supplied PD, file stages, exposure, and loss assumptions."],
    ["Calculate", "Compute loan-level expected loss using PD, LGD, and EAD."],
    ["Stress", "Test downside and upside scenarios and see how expected losses move."],
    ["Explain", "Investigate results and download a plain-language summary."],
  ];
  const actions = <Stack direction={{ xs: "column", sm: "row" }} gap={1.25}>
    <Button variant="contained" onClick={launchSample}>Explore sample portfolio</Button>
    <Button variant="outlined" onClick={upload}>Analyze your data</Button>
  </Stack>;
  return <Box sx={{ bgcolor: "#F7F8F6", color: "#1E2A36", "& .MuiButton-root": { textTransform: "none", fontWeight: 700 }, "& *:focus-visible": { outline: "3px solid #E0A500", outlineOffset: 3 } }}>
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, bgcolor: "#0B1F2A", color: "white" }}>
      <Container maxWidth="lg">
        <Stack direction="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" gap={2} py={1.75}>
          <Box><Typography fontWeight={800} fontSize={20}>RiskFrame</Typography><Typography variant="caption" color="#B8C8CD" sx={{ display: { xs: "none", sm: "block" } }}>Integrated Credit Risk Analytics Platform</Typography></Box>
          <Stack component="nav" aria-label="Home page" direction="row" gap={.5} alignItems="center">
            <Button color="inherit" sx={{ display: { xs: "none", md: "inline-flex" }, fontSize: 13 }} onClick={() => scrollToSection("product")}>Product</Button>
            <Button color="inherit" sx={{ display: { xs: "none", md: "inline-flex" }, fontSize: 13 }} onClick={() => scrollToSection("how")}>How it works</Button>
            <Button color="inherit" sx={{ display: { xs: "none", sm: "inline-flex" }, fontSize: 13 }} onClick={() => scrollToSection("data")}>Your data</Button>
            <Button color="inherit" component="a" href="/learn.html" sx={{ fontSize: 13 }}>Methodology</Button>
            <Button color="inherit" sx={{ display: { xs: "none", lg: "inline-flex" }, fontSize: 13 }} onClick={launchSample}>Explore sample</Button>
            <Button variant="contained" onClick={upload} sx={{ ml: 1, whiteSpace: "nowrap" }}>Analyze your data</Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
    <Box component="main">
      <Container maxWidth="lg">
        <Box component="section" sx={{ ...sectionSx, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" }, alignItems: "center", gap: { xs: 4, md: 6 } }}>
          <Box>
            <Typography sx={eyebrowSx}>Integrated credit risk analytics</Typography>
            <Typography component="h1" sx={{ ...displaySx, fontSize: { xs: "2.8rem", sm: "3.4rem", md: "3.7rem" }, mt: 1.5, mb: 2 }}>Credit risk,<br />made explainable.</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 17, lineHeight: 1.7, mb: 3 }}>Turn credit data into a clearer view of where risk sits, how assumptions affect it, and what needs attention next.</Typography>
            <Typography variant="body2" color="text.secondary" mb={2.5}>Built for lean risk teams, smaller lenders, consultants, and learning environments.</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} gap={1.25}>
              <Button variant="contained" onClick={() => navigate("/start")}>Explore RiskFrame</Button>
              <Button variant="outlined" onClick={upload}>Analyze your data</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" mt={2}>No login · No persistent storage · Explainable ECL</Typography>
          </Box>
          <DecisionQuestions />
        </Box>
      </Container>
      <Box sx={{ bgcolor: "white", borderBlock: "1px solid #E2E8E7" }}>
        <Container maxWidth="lg"><Box component="section" id="product" sx={sectionSx}>
          <Typography sx={eyebrowSx}>What RiskFrame delivers</Typography>
          <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 3 }}>From raw credit data to a decision-ready risk view.</Typography>
          <Typography color="text.secondary" maxWidth={820} mb={3}>Credit-risk analysis can be fragmented across spreadsheets, scripts, and reporting tools. RiskFrame brings the calculation and investigation into one focused workflow.</Typography>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
            {[
              ["01", "End-to-end analysis", "One connected risk view.", "Go from portfolio input to staging analysis, ECL, stress testing, and account-level investigation."],
              ["02", "Built for lean teams", "Less setup. More insight.", "Run structured credit-risk analysis without building a complex analytics stack."],
              ["03", "Explainable results", "Every number should have a reason.", "Trace key metrics to their assumptions, formulas, and inputs."],
              ["04", "Scenario testing", "Test what happens next.", "Adjust risk assumptions, apply changes, and compare their impact on portfolio ECL."],
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
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 3 }}>A clear path from loan file to risk decision.</Typography>
        <Box component="ol" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(5, minmax(0, 1fr))" }, p: 0, m: 0, listStyle: "none", gap: { xs: 2, sm: 0 } }}>
          {workflow.map(([title, text], index) => <Box component="li" key={title} sx={{ position: "relative", pr: { sm: 2 }, "&:not(:last-child):after": { content: '""', display: { xs: "none", sm: "block" }, position: "absolute", height: "1px", bgcolor: "#CFDDDD", top: 15, left: 32, right: 0 } }}>
            <Box sx={{ width: 30, height: 30, border: "1px solid #BDD2D3", borderRadius: "50%", display: "grid", placeItems: "center", color: "primary.main", fontSize: 12, fontWeight: 800 }}>{index + 1}</Box>
            <Typography fontWeight={700} mt={1.5}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>{text}</Typography>
          </Box>)}
        </Box>
      </Box></Container>
      <Box sx={{ bgcolor: "white", borderTop: "1px solid #E2E8E7" }}><Container maxWidth="lg"><Box component="section" sx={sectionSx}>
        <Typography sx={eyebrowSx}>One workflow, multiple questions</Typography>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 3 }}>Start with the portfolio. Investigate the account.</Typography>
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }} gap={2.5}>
          {[
            ["See the big picture", "Understand total exposure, expected loss, and provision rate."],
            ["Find where risk sits", "Compare loss across stages and regions, when those fields are available."],
            ["Investigate an account", "Review its stage, calculation inputs, and borrower context."],
            ["Test adverse conditions", "See how PD, LGD, or exposure shocks change ECL."],
            ["Focus attention", "Find accounts nearing the 30-day threshold when days-past-due data is supplied."],
          ].map(([title, text]) => <Box key={title} sx={{ borderLeft: "2px solid #D8E5E5", pl: 2 }}>
            <Typography component="h3" fontWeight={700} mb={1}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{text}</Typography>
          </Box>)}
        </Box>
      </Box></Container></Box>
      <Box sx={{ bgcolor: "#0B1F2A", color: "white" }}><Container maxWidth="lg"><Box sx={sectionSx}>
        <Typography sx={{ ...eyebrowSx, color: "#E0A500" }}>Built for credit-risk calculation</Typography>
        <Typography component="h2" sx={{ ...displaySx, color: "white", fontSize: { xs: 30, md: 40 }, maxWidth: 850, mt: 1, mb: 2 }}>The calculation is the product, not just the chart around it.</Typography>
        <Typography color="#BACACF" maxWidth={730}>Designed to complement BI tools, not imitate them. BI platforms support reporting; RiskFrame focuses on calculating, testing, and explaining credit-risk outcomes.</Typography>
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "repeat(3, 1fr)" }} gap={3} mt={3}>
          {[
            ["Calculation-first", "Apply explicit PD horizons, ECL formulas, and scenario assumptions."],
            ["Decision-focused", "Answer practical questions about portfolio concentration, accounts, and stress impact."],
            ["Transparent by design", "Inspect the formulas and inputs behind key results, with limitations made visible."],
          ].map(([title, text]) => <Box key={title} sx={{ borderTop: "1px solid #38505B", pt: 2 }}><Typography component="h3" fontWeight={700}>{title}</Typography><Typography variant="body2" color="#BACACF" mt={1}>{text}</Typography></Box>)}
        </Box>
        <Button component="a" href="/learn.html#limits" color="inherit" sx={{ mt: 2, px: 0 }}>Understand the methods and limitations →</Button>
      </Box></Container></Box>
      <Container maxWidth="lg"><Box component="section" sx={sectionSx}>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mb: 3 }}>Clarity. Control. Traceability.</Typography>
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
          {[
            ["Clarity", "See where risk sits across the portfolio and understand the loss estimate."],
            ["Control", "Test assumptions and compare how outcomes change."],
            ["Traceability", "Follow key results back to calculation logic and the data used."],
          ].map(([title, text]) => <Box key={title}><Typography component="h3" fontWeight={700} color="primary.main">{title}</Typography><Typography variant="body2" color="text.secondary" mt={1}>{text}</Typography></Box>)}
        </Box>
      </Box></Container>
      <Container maxWidth="lg"><Box component="section" id="data" sx={sectionSx}>
        <Typography sx={eyebrowSx}>Your data</Typography>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 1 }}>Simple inputs. Useful analysis.</Typography>
        <Typography color="text.secondary" maxWidth={750} mb={3}>Start with a portfolio CSV. An optional recovery / LGD file can inform the loss assumption. Only required fields are needed to get started; optional fields unlock deeper analysis.</Typography>
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2}>
          <SchemaPanel title="Portfolio file" description="Required. One row per account, with PD and stage." required={portfolioRequired} optional={portfolioOptional} />
          <SchemaPanel title="Recovery / LGD file" description="Optional. Recovery observations to inform the LGD assumption. Preserve uppercase headers." required={lgdRequired} optional={lgdOptional} />
        </Box>
      </Box></Container>
      <Box sx={{ bgcolor: "#EAF1F0", borderTop: "1px solid #DCE5E5" }}><Container maxWidth="lg"><Box component="section" sx={sectionSx}>
        <Typography sx={eyebrowSx}>A lightweight operating model</Typography>
        <Typography component="h2" sx={{ ...displaySx, fontSize: { xs: 30, md: 38 }, mt: 1, mb: 2 }}>Session-based analysis. No persistent storage.</Typography>
        <Typography color="text.secondary" maxWidth={850}>CSV files are parsed in your browser. Rows are sent to the server for each calculation and processed in memory, without being saved to a product database. This is not an offline or browser-only calculator. Refreshing clears the current session.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} gap={3} mt={3}>
          <Typography variant="body2"><strong>No account required</strong><br />Start with the sample immediately.</Typography>
          <Typography variant="body2"><strong>No persistent database</strong><br />Analysis is scoped to each request.</Typography>
          <Typography variant="body2"><strong>Transparent methodology</strong><br />Review formulas and limitations.</Typography>
        </Stack>
      </Box></Container></Box>
      <Box sx={{ bgcolor: "#0B1F2A", color: "white" }}><Container maxWidth="lg"><Box component="section" sx={{ ...sectionSx, "& .MuiButton-outlined": { color: "white", borderColor: "#AFC4CA" } }}>
        <Typography component="h2" sx={{ ...displaySx, color: "white", fontSize: { xs: 30, md: 40 }, mb: 2 }}>See your portfolio the way a risk analyst would.</Typography>
        <Typography color="#BACACF" maxWidth={770} mb={3}>Explore the built-in sample or analyze your data to move from exposure to ECL, stress impact, and borrower-level insight, without losing sight of how the answer was calculated.</Typography>
        {actions}
        <Typography variant="caption" color="#BACACF" display="block" mt={2}>No login required. Every number should have a reason.</Typography>
      </Box></Container></Box>
    </Box>
    <Box component="footer" sx={{ bgcolor: "#0B1F2A", color: "white", py: 3, borderTop: "1px solid #38505B" }}><Container maxWidth="lg">
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
        <Box><Typography fontWeight={800}>RiskFrame</Typography><Typography variant="body2" color="#BACACF">Integrated Credit Risk Analytics Platform</Typography><Typography variant="caption" color="#BACACF">Transparent IFRS 9 credit-risk analysis for portfolios, scenarios, and borrower-level review.</Typography></Box>
        <Stack direction="row" flexWrap="wrap" gap={.5}><Button color="inherit" onClick={() => scrollToSection("product")}>Product</Button><Button color="inherit" onClick={() => scrollToSection("data")}>Your data</Button><Button color="inherit" component="a" href="/learn.html">Methodology</Button><Button color="inherit" onClick={launchSample}>Explore sample</Button></Stack>
      </Stack>
      <Typography variant="caption" color="#BACACF" display="block" mt={2}>Session-based analysis. No persistent storage. Educational and analytical use only; not a booked provision or a substitute for professional judgement.</Typography>
    </Container></Box>
  </Box>;
}

import { currency, percent } from "../components/Common";
import type { ExplainPayload } from "../state/ExplainContext";

export type ExplanationTemplate = {
  title: string;
  value: string;
  formula: string;
  inputs: { label: string; value: string }[];
  plainLanguage: string;
  proxyNote?: string;
};

const number = (payload: ExplainPayload, key: string, fallback = 0) => Number(payload[key] ?? fallback);
const text = (payload: ExplainPayload, key: string, fallback = "Not available") => String(payload[key] ?? fallback);
const stagePdRule = (stage: number, lifetimeYears: number) => {
  if (stage === 1) return "Stage 1 uses the calibrated 12-month PD.";
  if (stage === 2) return `Stage 2 uses lifetime PD: 1 - (1 - PD)^${lifetimeYears}.`;
  return "Stage 3 uses PD = 1.0 because it is treated as credit-impaired.";
};

export const explanationTemplates: Record<string, (payload: ExplainPayload) => ExplanationTemplate> = {
  total_ecl: (payload) => ({
    title: "Total expected credit loss",
    value: currency(number(payload, "total_ecl")),
    formula: "ECL = sum over loans of PD x LGD x EAD",
    inputs: [
      { label: "Total EAD", value: currency(number(payload, "total_ead")) },
      { label: "LGD used", value: percent(number(payload, "lgd_used"), 2) },
      { label: "Accounts", value: text(payload, "n") },
    ],
    plainLanguage: "For every loan, RiskFrame multiplies the probability of default, loss severity, and exposure at default. It then adds those loan-level estimates into this portfolio total.",
    proxyNote: "This is an estimate, not a booked figure. EAD or LGD may be configured proxies.",
  }),
  total_ead: (payload) => ({
    title: "Total exposure at default",
    value: currency(number(payload, "total_ead")),
    formula: "Total EAD = sum of EAD used for every loan",
    inputs: [{ label: "Accounts", value: text(payload, "n") }, { label: "EAD source", value: text(payload, "ead_source", "Configured global or file column") }],
    plainLanguage: "This is the exposure amount used in the ECL calculation for every loan, added across the portfolio.",
    proxyNote: "This is an estimate, not a booked figure when the configured global EAD is used.",
  }),
  provision_pct: (payload) => ({
    title: "Provision percentage of book",
    value: percent(number(payload, "provision_pct"), 2),
    formula: "Total ECL / Total EAD",
    inputs: [{ label: "Total ECL", value: currency(number(payload, "total_ecl")) }, { label: "Total EAD", value: currency(number(payload, "total_ead")) }],
    plainLanguage: "This expresses the portfolio expected loss as a share of the exposure used for the calculation.",
    proxyNote: "This is an estimate, not a booked figure. It inherits the EAD and LGD assumptions used in ECL.",
  }),
  average_pd: (payload) => ({
    title: "Average 12-month PD",
    value: percent(number(payload, "avg_pd"), 2),
    formula: "Average PD used = mean of each loan's stage-adjusted PD",
    inputs: [{ label: "Accounts", value: text(payload, "n") }, { label: "Stage rule", value: "Stage 1: 12-month, Stage 2: lifetime, Stage 3: 1.0" }],
    plainLanguage: "The average uses the PD horizon selected by each loan's stage, not simply the raw 12-month PD for every loan.",
  }),
  accounts: (payload) => ({
    title: "Accounts analysed",
    value: text(payload, "n"),
    formula: "Accounts = count of portfolio rows",
    inputs: [{ label: "Portfolio rows", value: text(payload, "n") }],
    plainLanguage: "Each row in the submitted portfolio represents one account in this cross-sectional analysis.",
  }),
  stage_ecl: (payload) => {
    const stage = number(payload, "stage");
    const lifetimeYears = number(payload, "lifetime_years", 5);
    return {
      title: `Stage ${stage} expected credit loss`,
      value: currency(number(payload, "ecl")),
      formula: `Stage ${stage} ECL = sum of PD used x LGD used x EAD used for Stage ${stage} loans`,
      inputs: [
        { label: "Stage accounts", value: text(payload, "count") },
        { label: "Portfolio share", value: percent(number(payload, "share"), 2) },
        { label: "PD horizon", value: stagePdRule(stage, lifetimeYears) },
        { label: "Lifetime years (N)", value: String(lifetimeYears) },
      ],
      plainLanguage: `${stagePdRule(stage, lifetimeYears)} RiskFrame calculates ECL loan by loan using that PD choice, then adds the Stage ${stage} loans together.`,
      proxyNote: "This is an estimate, not a booked figure. EAD or LGD may be configured proxies.",
    };
  },
  borrower_ecl: (payload) => ({
    title: "Borrower expected credit loss",
    value: currency(number(payload, "ecl")),
    formula: "ECL = PD used x LGD used x EAD used",
    inputs: [
      { label: "Stage", value: `Stage ${text(payload, "stage")}` },
      { label: "PD used", value: percent(number(payload, "pd_used"), 4) },
      { label: "LGD used", value: percent(number(payload, "lgd_used"), 2) },
      { label: "EAD used", value: currency(number(payload, "ead_used")) },
    ],
    plainLanguage: "This borrower’s PD chosen by stage is multiplied by the selected LGD and EAD. The result is the expected loss estimate for this account.",
    proxyNote: "This is an estimate, not a booked figure. EAD or LGD may be configured proxies.",
  }),
  borrower_stage: (payload) => {
    const stage = number(payload, "stage");
    const lifetimeYears = number(payload, "lifetime_years", 5);
    return {
      title: "Borrower stage and PD horizon",
      value: `Stage ${stage}`,
      formula: "PD used depends on stage: Stage 1 = 12-month PD; Stage 2 = 1 - (1 - PD)^N; Stage 3 = 1.0",
      inputs: [{ label: "File stage", value: `Stage ${stage}` }, { label: "Rule stage", value: `Stage ${text(payload, "stage_rule")}` }, { label: "Lifetime years (N)", value: String(lifetimeYears) }],
      plainLanguage: stagePdRule(stage, lifetimeYears),
    };
  },
  borrower_pd: (payload) => ({
    title: "Borrower probability of default",
    value: percent(number(payload, "value"), 2),
    formula: text(payload, "formula", "PD used is selected according to the borrower stage"),
    inputs: [{ label: "Stage", value: `Stage ${text(payload, "stage")}` }, { label: "PD used", value: percent(number(payload, "pd_used"), 4) }],
    plainLanguage: "This value is an input to borrower ECL after the stage rule selects the appropriate PD horizon.",
  }),
  borrower_lgd: (payload) => ({
    title: "Borrower loss given default",
    value: percent(number(payload, "lgd_used"), 2),
    formula: "Borrower ECL = PD used x LGD used x EAD used",
    inputs: [{ label: "LGD used", value: percent(number(payload, "lgd_used"), 2) }, { label: "LGD source", value: text(payload, "lgd_source", "Configured global or LGD file") }],
    plainLanguage: "LGD represents the portion of exposure expected to be lost if the borrower defaults.",
    proxyNote: "This is an estimate, not a booked figure. LGD may be a portfolio-level proxy.",
  }),
  borrower_ead: (payload) => ({
    title: "Borrower exposure at default",
    value: currency(number(payload, "ead_used")),
    formula: "Borrower ECL = PD used x LGD used x EAD used",
    inputs: [{ label: "EAD used", value: currency(number(payload, "ead_used")) }, { label: "EAD source", value: text(payload, "ead_source", "Configured global or file column") }],
    plainLanguage: "EAD is the exposure amount used when calculating the borrower’s expected credit loss.",
    proxyNote: "This is an estimate, not a booked figure when the configured global EAD is used.",
  }),
  lgd_used: (payload) => ({
    title: "LGD used in ECL",
    value: percent(number(payload, "lgd_used"), 2),
    formula: "EAD-weighted LGD = sum(EAD x observed LGD) / sum(EAD)",
    inputs: [{ label: "LGD used", value: percent(number(payload, "lgd_used"), 4) }, { label: "LGD source", value: text(payload, "lgd_source") }],
    plainLanguage: "The LGD file is weighted by exposure so larger exposures contribute proportionally more to the loss severity used in ECL.",
    proxyNote: "This is an estimate, not a booked figure. The value is a portfolio-level LGD proxy.",
  }),
  weighted_ecl: (payload) => {
    const scenarios = (payload.scenario_ecl ?? {}) as Record<string, number>;
    const weights = (payload.weights ?? {}) as Record<string, number>;
    const inputs = Object.keys(scenarios).map((name) => ({ label: `${name}: ${percent(Number(weights[name] ?? 0), 1)}`, value: currency(Number(scenarios[name])) }));
    return {
      title: "Probability-weighted scenario ECL",
      value: currency(number(payload, "weighted_ecl")),
      formula: "Weighted ECL = sum of normalised scenario weight x scenario ECL",
      inputs,
      plainLanguage: "Each scenario recalculates ECL after its PD and LGD adjustments. The results are combined using weights normalised to sum to 100%.",
      proxyNote: "This is an estimate, not a booked figure. It includes scenario assumptions and EAD or LGD proxies.",
    };
  },
};

export function resolveExplanation(metricId: string, payload: ExplainPayload): ExplanationTemplate {
  const template = explanationTemplates[metricId];
  if (template) return template(payload);
  return {
    title: "RiskFrame metric",
    value: text(payload, "value"),
    formula: "See the current analysis inputs",
    inputs: [],
    plainLanguage: "This figure is calculated from the data currently loaded in RiskFrame.",
  };
}

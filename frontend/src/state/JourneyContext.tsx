import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDataSource } from "../dataSource";

export type JourneyStep = {
  path: string;
  label: string;
  technical: string;
  blurb: string;
  optional?: boolean;
};

export const JOURNEY_STEPS: JourneyStep[] = [
  { path: "/app/overview", label: "Big picture", technical: "Portfolio overview", blurb: "See the provision headline before exploring the detail." },
  { path: "/app/book", label: "Where the risk is", technical: "Portfolio and stages", blurb: "Find which stages, regions, and trends drive expected loss." },
  { path: "/app/borrower", label: "Account analysis", technical: "Borrower-level risk", blurb: "Inspect an account’s stage, expected loss and what-if outcomes." },
  { path: "/app/stress", label: "Stress test", technical: "Scenarios and sensitivity", blurb: "See how the provision changes when its core drivers move." },
  { path: "/app/recoveries", label: "Recoveries", technical: "LGD analysis", blurb: "Review recovery data and the LGD assumption feeding ECL.", optional: true },
  { path: "/app/watchlist", label: "Early warning", technical: "Watchlist", blurb: "Focus on accounts close to the Stage 2 threshold." },
  { path: "/app/report", label: "Summary report", technical: "Report", blurb: "Create a plain-language record of the current analysis." },
];

type Journey = {
  steps: JourneyStep[];
  currentIndex: number;
  guided: boolean;
  setGuided: (guided: boolean) => void;
  next: () => void;
  previous: () => void;
};

const JourneyContext = createContext<Journey | undefined>(undefined);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasLgd } = useDataSource();
  const [guided, setGuided] = useState(true);
  const steps = useMemo(() => JOURNEY_STEPS.filter((step) => !step.optional || hasLgd), [hasLgd]);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.path === location.pathname));
  const next = () => navigate(steps[(currentIndex + 1) % steps.length].path);
  const previous = () => { if (currentIndex > 0) navigate(steps[currentIndex - 1].path); };
  return <JourneyContext.Provider value={{ steps, currentIndex, guided, setGuided, next, previous }}>{children}</JourneyContext.Provider>;
}

export function useJourney(): Journey {
  const value = useContext(JourneyContext);
  if (!value) throw new Error("JourneyProvider is required");
  return value;
}

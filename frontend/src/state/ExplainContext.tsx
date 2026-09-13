import { createContext, useContext, useState, type ReactNode } from "react";

export type ExplainPayload = Record<string, unknown>;
export type OpenExplanation = { metricId: string; payload: ExplainPayload };

type ExplainContextValue = {
  explanation?: OpenExplanation;
  openExplanation: (metricId: string, payload: ExplainPayload) => void;
  closeExplanation: () => void;
};

const ExplainContext = createContext<ExplainContextValue | undefined>(undefined);

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [explanation, setExplanation] = useState<OpenExplanation>();
  const openExplanation = (metricId: string, payload: ExplainPayload) => setExplanation({ metricId, payload });
  const closeExplanation = () => setExplanation(undefined);
  return <ExplainContext.Provider value={{ explanation, openExplanation, closeExplanation }}>{children}</ExplainContext.Provider>;
}

export function useExplain() {
  const context = useContext(ExplainContext);
  if (!context) throw new Error("ExplainProvider is required");
  return context;
}

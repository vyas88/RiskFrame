import Papa from "papaparse";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { DataQuality } from "./types";

export type Row = Record<string, string>;
export type RequestBody = { source: "sample" | "inline"; portfolio_rows?: Row[]; lgd_rows?: Row[] };
export type ActiveSource = "none" | "sample" | "inline";
type DataSource = {
  source: ActiveSource;
  portfolioBody?: RequestBody;
  lgdBody?: RequestBody;
  health?: DataQuality;
  message: string;
  activeLabel: string;
  hasLgd: boolean;
  inlinePortfolioRows?: Row[];
  portfolioFilename?: string;
  useSample: () => void;
  useInlineData: (portfolioRows: Row[], portfolioFilename: string, lgdRows?: Row[], lgdFilename?: string) => void;
  addLgdData: (lgdRows: Row[], lgdFilename: string) => void;
  clearData: () => void;
};

const MAX_FILE_BYTES = 3_000_000;
const DataSourceContext = createContext<DataSource | undefined>(undefined);

export async function parseCsv(file: File): Promise<Row[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too large for browser analysis. Use a smaller file or the built-in sample.");
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (results) => {
        if (results.errors.length) { reject(new Error("This CSV could not be read. Check that quotes and commas are formatted correctly.")); return; }
        const headers = results.meta.fields?.map((field) => field.trim()) ?? [];
        if (!headers.length || headers.some((header) => !header)) { reject(new Error("The CSV needs a header row with a name for every column.")); return; }
        if (!results.data.length) { reject(new Error("The CSV needs at least one data row below the header.")); return; }
        resolve(results.data.map((row) => Object.fromEntries(headers.map((header) => [header, String(row[header] ?? "").trim()]))));
      },
      error: () => reject(new Error("This CSV could not be read. Choose a standard comma-separated file.")),
    });
  });
}

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<ActiveSource>("none");
  const [portfolioRows, setPortfolioRows] = useState<Row[]>();
  const [lgdRows, setLgdRows] = useState<Row[]>();
  const [portfolioFilename, setPortfolioFilename] = useState<string>();
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState<DataQuality>();
  const refreshHealth = useCallback((body: RequestBody) => { void api.post<DataQuality>("/api/data-quality", body).then(setHealth).catch(() => setHealth(undefined)); }, []);
  const useSample = useCallback(() => { setSource("sample"); setPortfolioRows(undefined); setLgdRows(undefined); setPortfolioFilename(undefined); setMessage("Using the bundled sample for each request."); refreshHealth({ source: "sample" }); }, [refreshHealth]);
  const useInlineData = useCallback((rows: Row[], filename: string, newLgdRows?: Row[], lgdFilename?: string) => { const body: RequestBody = { source: "inline", portfolio_rows: rows, ...(newLgdRows ? { lgd_rows: newLgdRows } : {}) }; setSource("inline"); setPortfolioRows(rows); setLgdRows(newLgdRows); setPortfolioFilename(filename); setMessage(`Using ${rows.length.toLocaleString()} portfolio rows in this browser session${lgdFilename ? ` with ${lgdFilename}` : ""}.`); refreshHealth(body); }, [refreshHealth]);
  const addLgdData = useCallback((rows: Row[], filename: string) => { if (!portfolioRows) return; setLgdRows(rows); setMessage(`Added ${filename} to the current browser-session analysis.`); refreshHealth({ source: "inline", portfolio_rows: portfolioRows, lgd_rows: rows }); }, [portfolioRows, refreshHealth]);
  const clearData = useCallback(() => { setSource("none"); setPortfolioRows(undefined); setLgdRows(undefined); setPortfolioFilename(undefined); setMessage(""); setHealth(undefined); }, []);
  const value = useMemo<DataSource>(() => {
    const portfolioBody = source === "sample" ? { source: "sample" as const } : source === "inline" && portfolioRows ? { source: "inline" as const, portfolio_rows: portfolioRows, ...(lgdRows ? { lgd_rows: lgdRows } : {}) } : undefined;
    const lgdBody = source === "sample" ? { source: "sample" as const } : source === "inline" && lgdRows ? { source: "inline" as const, lgd_rows: lgdRows } : undefined;
    return { source, portfolioBody, lgdBody, health, message, activeLabel: source === "sample" ? "Sample data" : source === "inline" && portfolioRows ? `Your file: ${portfolioFilename ?? "portfolio.csv"} (${portfolioRows.length.toLocaleString()} rows)` : "No data loaded", hasLgd: source === "sample" || Boolean(lgdRows), inlinePortfolioRows: portfolioRows, portfolioFilename, useSample, useInlineData, addLgdData, clearData };
  }, [source, portfolioRows, lgdRows, health, message, portfolioFilename, useSample, useInlineData, addLgdData, clearData]);
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  const value = useContext(DataSourceContext);
  if (!value) throw new Error("DataSourceProvider is required");
  return value;
}

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Row = Record<string, string>;
type RequestBody = { source: "sample" | "inline"; portfolio_rows?: Row[]; lgd_rows?: Row[] };
type DataSource = { portfolioBody: RequestBody; lgdBody: RequestBody; message: string; loadPortfolio: (file: File) => Promise<void>; loadLgd: (file: File) => Promise<void>; useSample: () => void };

const MAX_FILE_BYTES = 3_000_000;
const DataSourceContext = createContext<DataSource | undefined>(undefined);

function parseLine(line: string): string[] {
  const cells: string[] = []; let current = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { cells.push(current.trim()); current = ""; }
    else current += character;
  }
  cells.push(current.trim());
  return cells;
}

async function readCsv(file: File): Promise<Row[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too large for serverless analysis. Use a smaller file or the bundled sample.");
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
  const headers = parseLine(lines[0]);
  if (headers.some((header) => !header)) throw new Error("The CSV contains an empty column header.");
  return lines.slice(1).map((line) => { const values = parseLine(line); const row: Row = {}; headers.forEach((header, index) => { row[header] = values[index] ?? ""; }); return row; });
}

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [portfolioRows, setPortfolioRows] = useState<Row[]>(); const [lgdRows, setLgdRows] = useState<Row[]>(); const [message, setMessage] = useState("");
  const value = useMemo<DataSource>(() => ({
    portfolioBody: portfolioRows ? { source: "inline", portfolio_rows: portfolioRows, ...(lgdRows ? { lgd_rows: lgdRows } : {}) } : { source: "sample" },
    lgdBody: lgdRows ? { source: "inline", lgd_rows: lgdRows } : { source: "sample" },
    message,
    loadPortfolio: async (file) => { const rows = await readCsv(file); setPortfolioRows(rows); setMessage(`Using ${rows.length} portfolio rows in this browser session.`); },
    loadLgd: async (file) => { const rows = await readCsv(file); setLgdRows(rows); setMessage(`Using ${rows.length} LGD rows in this browser session.`); },
    useSample: () => { setPortfolioRows(undefined); setLgdRows(undefined); setMessage("Using the bundled sample for each request."); },
  }), [portfolioRows, lgdRows, message]);
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  const value = useContext(DataSourceContext);
  if (!value) throw new Error("DataSourceProvider is required");
  return value;
}

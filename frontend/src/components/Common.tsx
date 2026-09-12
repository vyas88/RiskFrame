import { Alert, Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import type { ReactNode } from "react";

export const stageColors: Record<number, string> = { 1: "#2e7d32", 2: "#ed6c02", 3: "#d32f2f" };
export const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

export function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <Card sx={{ height: "100%" }}><CardContent><Typography variant="h6">{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>{children}</CardContent></Card>;
}
export function LoadingPanels({ count = 4 }: { count?: number }) {
  return <Box display="grid" gridTemplateColumns="repeat(auto-fit,minmax(180px,1fr))" gap={2}>{Array.from({ length: count }, (_, i) => <Skeleton key={i} variant="rounded" height={135} />)}</Box>;
}
export function ErrorPanel({ message }: { message: string }) { return <Alert severity="error">{message}</Alert>; }

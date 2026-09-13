import { ButtonBase, Box, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { resolveExplanation } from "../explain/templates";
import type { ExplainPayload } from "../state/ExplainContext";
import { useExplain } from "../state/ExplainContext";

export function Figure({ value, variant = "h5" }: { value: string; variant?: "h4" | "h5" | "h6" | "body1" | "body2" }) {
  return <Typography component="span" display="block" variant={variant} fontWeight={700}>{value}</Typography>;
}

export function Explainable({ metricId, payload, children, label }: { metricId: string; payload: ExplainPayload; children: ReactNode; label?: string }) {
  const { openExplanation } = useExplain();
  return <ButtonBase onClick={() => openExplanation(metricId, payload)} aria-label={`Explain ${label ?? metricId}`} sx={{ display: "inline-flex", maxWidth: "100%", textAlign: "left", borderRadius: 1, "&:hover": { color: "primary.main", textDecoration: "underline" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>{children}</ButtonBase>;
}

export function ExplainDrawer() {
  const { explanation, closeExplanation } = useExplain();
  const content = explanation ? resolveExplanation(explanation.metricId, explanation.payload) : undefined;
  return <Drawer anchor="right" open={Boolean(content)} onClose={closeExplanation} PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, p: 3 } }}>
    {content && <Stack spacing={2}>
      <Box display="flex" justifyContent="space-between" gap={2} alignItems="flex-start"><Box><Typography variant="overline" color="primary">Explain this figure</Typography><Typography variant="h5">{content.title}</Typography></Box><IconButton aria-label="Close explanation" onClick={closeExplanation}>×</IconButton></Box>
      <Figure value={content.value} variant="h4" />
      <Divider />
      <Box><Typography variant="subtitle2" gutterBottom>How this is calculated</Typography><Box sx={{ bgcolor: "grey.100", borderRadius: 1, p: 1.5, fontFamily: "monospace", fontSize: 14 }}>{content.formula}</Box></Box>
      <Box><Typography variant="subtitle2" gutterBottom>Inputs used</Typography><Stack spacing={1}>{content.inputs.map((input) => <Box key={input.label} display="flex" justifyContent="space-between" gap={2}><Typography variant="body2" color="text.secondary">{input.label}</Typography><Typography variant="body2" textAlign="right">{input.value}</Typography></Box>)}</Stack></Box>
      <Box><Typography variant="subtitle2" gutterBottom>Why this number matters</Typography><Typography variant="body2">{content.plainLanguage}</Typography></Box>
      {content.proxyNote && <Box sx={{ bgcolor: "warning.light", borderRadius: 1, p: 1.5 }}><Typography variant="body2">{content.proxyNote}</Typography></Box>}
    </Stack>}
  </Drawer>;
}

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useJourney } from "../state/JourneyContext";

export function JourneyPage({ children }: { children: ReactNode }) {
  const { steps, currentIndex, guided, previous, next } = useJourney();
  const step = steps[currentIndex];
  const following = steps[currentIndex + 1];
  return <Box pb={10}>
    <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
      <Box><Typography variant="overline" color="primary.main" fontWeight={800}>Guided analysis</Typography><Typography component="h1" variant="h4" fontWeight={800}>{step.label}</Typography><Typography color="text.secondary" mt={.5}>{step.blurb}</Typography></Box>
      <Chip label={`Step ${currentIndex + 1} of ${steps.length}`} color="primary" variant="outlined" />
    </Box>
    {children}
    <Box sx={{ position: "fixed", bottom: 0, left: { xs: 0, md: 280 }, right: 0, zIndex: 5, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider", px: { xs: 2, md: 3 }, py: 1.25, opacity: guided ? 1 : .78 }}>
      <Stack direction="row" justifyContent="space-between" maxWidth="xl" mx="auto">{currentIndex === 0 ? <Box /> : <Button onClick={previous}>Back</Button>}<Button variant={guided ? "contained" : "outlined"} onClick={next}>{following ? `Next: ${following.label}` : "Finish and return to overview"}</Button></Stack>
    </Box>
  </Box>;
}

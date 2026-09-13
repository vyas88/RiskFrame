import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import App from "./App";
import { DataSourceProvider } from "./dataSource";
import { ExplainProvider } from "./state/ExplainContext";
import { JourneyProvider } from "./state/JourneyContext";

const theme = createTheme({ palette: { primary: { main: "#0E4B5A" }, success: { main: "#2F8F5B" }, warning: { main: "#C79212" }, error: { main: "#B23A32" }, text: { primary: "#1E2A36", secondary: "#6B7A88" }, background: { default: "#F4F6F8", paper: "#FFFFFF" }, divider: "#E2E8ED" }, shape: { borderRadius: 12 }, typography: { fontFamily: "Inter, Arial, sans-serif" }, components: { MuiCard: { styleOverrides: { root: { borderRadius: 16 } } } } });
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ThemeProvider theme={theme}><HashRouter><DataSourceProvider><JourneyProvider><ExplainProvider><App /></ExplainProvider></JourneyProvider></DataSourceProvider></HashRouter></ThemeProvider></React.StrictMode>);

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import App from "./App";
import { DataSourceProvider } from "./dataSource";

const theme = createTheme({ palette: { primary: { main: "#0f4c5c" }, success: { main: "#2e7d32" }, warning: { main: "#ed6c02" }, error: { main: "#d32f2f" }, background: { default: "#f4f7fa" } }, shape: { borderRadius: 12 }, typography: { fontFamily: "Inter, Arial, sans-serif" }, components: { MuiCard: { styleOverrides: { root: { borderRadius: 16 } } } } });
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ThemeProvider theme={theme}><HashRouter><DataSourceProvider><App /></DataSourceProvider></HashRouter></ThemeProvider></React.StrictMode>);

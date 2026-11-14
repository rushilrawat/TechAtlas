import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installAnalytics } from "./analytics";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

installAnalytics();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

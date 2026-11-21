import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installAnalytics } from "./analytics";
import { loadContent } from "./content/content";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

installAnalytics();
// Start fetching guided paths, roles and apps alongside the entry chunk's first render.
void loadContent();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

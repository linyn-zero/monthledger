import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LedgerSession } from "./adapter/session";
import { App } from "./ui/App";
import "./ui/styles.css";

const session = new LedgerSession();
window.ledgerApi = session.createApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>
);

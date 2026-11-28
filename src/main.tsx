import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LedgerSession } from "./adapter/session";
import { initUmami } from "./lib/analytics";
import { App } from "./ui/App";
import "./ui/styles.css";

// File System Access API needs a secure context; custom domains often land on http:// first.
if (
  window.location.protocol === "http:" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
) {
  window.location.replace(
    `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`
  );
} else {
  initUmami();

  const session = new LedgerSession();
  window.ledgerApi = session.createApi();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App session={session} />
    </StrictMode>
  );
}

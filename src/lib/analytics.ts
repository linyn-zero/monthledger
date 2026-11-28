const WEBSITE_ID =
  import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "16a5d7e1-69e3-409d-a203-a5cf2bfd3569";
const SCRIPT_SRC =
  import.meta.env.VITE_UMAMI_SCRIPT_URL ?? "https://cloud.umami.is/script.js";

export type AnalyticsProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: AnalyticsProps) => void;
    };
  }
}

/** Inject Umami only in production builds (includes `vite preview`). */
export function initUmami(): void {
  if (!import.meta.env.PROD) return;
  if (document.querySelector(`script[data-website-id="${WEBSITE_ID}"]`)) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = SCRIPT_SRC;
  script.dataset.websiteId = WEBSITE_ID;
  document.head.appendChild(script);
}

export function track(event: string, data?: AnalyticsProps): void {
  window.umami?.track?.(event, data);
}

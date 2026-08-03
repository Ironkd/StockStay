/**
 * Umami Cloud analytics helpers. No-ops when env vars are unset.
 */

declare global {
  interface Window {
    umami?: {
      track: (
        event?: string | Record<string, unknown> | ((props: Record<string, unknown>) => Record<string, unknown>),
        data?: Record<string, unknown>
      ) => void;
    };
  }
}

const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL as string | undefined;

export function isAnalyticsEnabled(): boolean {
  return Boolean(websiteId?.trim() && scriptUrl?.trim());
}

export function getUmamiConfig(): { websiteId: string; scriptUrl: string } | null {
  if (!isAnalyticsEnabled()) return null;
  return { websiteId: websiteId!.trim(), scriptUrl: scriptUrl!.trim() };
}

/** SPA pageview (Umami auto-track misses client-side route changes). */
export function trackPageview(url?: string): void {
  if (!isAnalyticsEnabled() || typeof window === "undefined" || !window.umami) return;
  try {
    const path = url || `${window.location.pathname}${window.location.search}`;
    window.umami.track({ url: path, title: document.title });
  } catch {
    // ignore
  }
}

/** Custom event (e.g. signup, feedback_sent). */
export function track(event: string, data?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled() || typeof window === "undefined" || !window.umami) return;
  try {
    if (data && Object.keys(data).length > 0) {
      window.umami.track(event, data);
    } else {
      window.umami.track(event);
    }
  } catch {
    // ignore
  }
}

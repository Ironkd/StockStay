import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getUmamiConfig, trackPageview } from "../lib/analytics";

/** Inject Umami Cloud script once; track SPA navigations. */
export function UmamiAnalytics(): null {
  const location = useLocation();

  useEffect(() => {
    const config = getUmamiConfig();
    if (!config) return;
    if (document.querySelector(`script[data-website-id="${config.websiteId}"]`)) {
      return;
    }
    const script = document.createElement("script");
    script.defer = true;
    script.src = config.scriptUrl;
    script.setAttribute("data-website-id", config.websiteId);
    script.setAttribute("data-auto-track", "false");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!getUmamiConfig()) return;
    const path = `${location.pathname}${location.search}`;
    // Wait a tick so the script can define window.umami on first load
    const t = window.setTimeout(() => trackPageview(path), 0);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);

  return null;
}

/**
 * Load Google Maps JavaScript API with Places library (for address autocomplete).
 * Uses the callback parameter so we only resolve when the API is actually ready.
 */
declare global {
  interface Window {
    google?: { maps?: { places?: unknown } };
    __googleMapsReady?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined" || !apiKey) {
    return Promise.reject(new Error("Missing API key or not in browser"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__googleMapsReady";
    (window as Window & { __googleMapsReady?: () => void })[callbackName] = () => {
      delete (window as Window & { __googleMapsReady?: () => void })[callbackName];
      if (window.google?.maps?.places) {
        resolve();
      } else {
        reject(new Error("Google Maps Places failed to load"));
      }
    };
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.onerror = () => {
      delete (window as Window & { __googleMapsReady?: () => void })[callbackName];
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

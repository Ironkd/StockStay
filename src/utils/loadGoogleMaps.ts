/**
 * Load Google Maps JavaScript API with Places library (for address autocomplete).
 * Requires VITE_GOOGLE_MAPS_API_KEY. Resolves when google.maps.places is available.
 */
declare global {
  interface Window {
    google?: { maps?: { places?: unknown } };
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
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve();
      } else {
        reject(new Error("Google Maps Places failed to load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

import React, { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "../utils/loadGoogleMaps";

export type AddressResult = {
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  country?: string;
};

type AddressAutocompleteProps = {
  onSelect: (address: AddressResult) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Optional: restrict to country (e.g. "ca" for Canada). */
  componentRestrictions?: { country: string | string[] };
};

/** Minimal types for Google Place result (loaded at runtime). */
type PlaceAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type PlaceResult = {
  address_components?: PlaceAddressComponent[];
};

function getComponent(components: PlaceAddressComponent[] | undefined, type: string, useShort = false): string {
  if (!components) return "";
  const c = components.find((r) => r.types.includes(type));
  return useShort ? (c?.short_name ?? "") : (c?.long_name ?? "");
}

function parseAddressComponents(components: PlaceAddressComponent[] | undefined): AddressResult {
  if (!components?.length) {
    return { streetAddress: "", city: "", province: "", postalCode: "" };
  }
  const streetNumber = getComponent(components, "street_number");
  const route = getComponent(components, "route");
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    getComponent(components, "locality") ||
    getComponent(components, "sublocality") ||
    getComponent(components, "sublocality_level_1") ||
    getComponent(components, "administrative_area_level_2");
  // Use short_name for province so it matches province codes (e.g. ON, BC); fall back to long_name
  const province =
    getComponent(components, "administrative_area_level_1", true) ||
    getComponent(components, "administrative_area_level_1");
  const postalCode = getComponent(components, "postal_code");
  const country = getComponent(components, "country");
  return { streetAddress, city, province, postalCode, country: country || undefined };
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onSelect,
  placeholder = "Start typing your address...",
  id,
  className,
  componentRestrictions,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<unknown>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!API_KEY || !inputRef.current) {
      if (!API_KEY) setUnavailable(true);
      return;
    }

    let cancelled = false;

    loadGoogleMapsScript(API_KEY)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const google = (window as Window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, opts?: unknown) => { getPlace: () => PlaceResult; addListener: (event: string, fn: () => void) => void } } } } }).google;
        if (!google?.maps?.places?.Autocomplete) return;
        const Autocomplete = google.maps.places.Autocomplete;
        const opts: { types?: string[]; componentRestrictions?: { country: string | string[] } } = { types: ["address"] };
        if (componentRestrictions?.country) {
          opts.componentRestrictions = { country: componentRestrictions.country };
        }
        const autocomplete = new Autocomplete(inputRef.current, opts);
        autocompleteRef.current = autocomplete;
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace() as PlaceResult;
          const addr = parseAddressComponents(place.address_components);
          onSelectRef.current(addr);
        });
        setReady(true);
      })
      .catch(() => setUnavailable(true));

    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [componentRestrictions]);

  if (unavailable) return null;

  return (
    <label style={{ display: "block", marginBottom: "8px" }}>
      <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>
        Search address
      </span>
      <input
        ref={inputRef}
        type="text"
        id={id}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(148, 163, 184, 0.7)",
          fontSize: "14px",
        }}
        aria-describedby={ready ? undefined : "address-autocomplete-hint"}
      />
      {ready && (
        <span id="address-autocomplete-hint" style={{ fontSize: "12px", color: "#64748b", display: "block", marginTop: "4px" }}>
          Select an address from the list to fill the fields below
        </span>
      )}
    </label>
  );
};

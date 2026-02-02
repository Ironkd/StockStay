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
  /** Current street address value (controlled). */
  value: string;
  /** Called when user types in the street address field. */
  onChange: (value: string) => void;
  /** Called when user selects an address from the dropdown; use to fill city, province, postal, etc. */
  onSelect: (address: AddressResult) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Label for the field (e.g. "Street address"). */
  label?: string;
  /** Optional: restrict to country (e.g. "ca" for Canada). */
  componentRestrictions?: { country: string | string[] };
  /** Inline styles for the wrapper label. */
  style?: React.CSSProperties;
  /** Whether the field is required (HTML required attribute). */
  required?: boolean;
};

/** Minimal types for Google Place result (loaded at runtime). */
type PlaceAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type PlaceResult = {
  place_id?: string;
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
  value,
  onChange,
  onSelect,
  placeholder = "123 Main St or start typing to search",
  id,
  className,
  label = "Street address",
  componentRestrictions,
  style,
  required,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<unknown>(null);
  const onSelectRef = useRef(onSelect);
  const onChangeRef = useRef(onChange);
  const [unavailable, setUnavailable] = useState(false);

  onSelectRef.current = onSelect;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!API_KEY) {
      setUnavailable(true);
      return;
    }

    let cancelled = false;
    const inputEl = inputRef.current;

    loadGoogleMapsScript(API_KEY)
      .then(() => {
        if (cancelled) return;
        const input = inputEl ?? inputRef.current;
        if (!input) return;
        const google = (window as Window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, opts?: unknown) => { getPlace: () => PlaceResult; addListener: (event: string, fn: () => void) => void }; PlacesService: new (div: HTMLDivElement) => { getDetails: (req: { placeId: string; fields?: string[] }, cb: (place: PlaceResult | null, status: string) => void) => void } } } } }).google;
        if (!google?.maps?.places?.Autocomplete) return;
        const Autocomplete = google.maps.places.Autocomplete;
        const opts: { types?: string[]; componentRestrictions?: { country: string | string[] } } = { types: ["address"] };
        if (componentRestrictions?.country) {
          opts.componentRestrictions = { country: componentRestrictions.country };
        }
        const autocomplete = new Autocomplete(input, opts);
        autocompleteRef.current = autocomplete;

        const fillFromPlace = (place: PlaceResult) => {
          let components = place.address_components;
          if ((!components || !components.length) && place.place_id && google.maps.places?.PlacesService) {
            const div = document.createElement("div");
            const service = new google.maps.places.PlacesService(div);
            service.getDetails({ placeId: place.place_id, fields: ["address_components"] }, (detail, status) => {
              if (cancelled || status !== "OK" || !detail) {
                const addr = parseAddressComponents(place.address_components);
                onChangeRef.current(addr.streetAddress);
                onSelectRef.current(addr);
                return;
              }
              const addr = parseAddressComponents((detail as PlaceResult).address_components);
              onChangeRef.current(addr.streetAddress);
              onSelectRef.current(addr);
            });
          } else {
            const addr = parseAddressComponents(components);
            onChangeRef.current(addr.streetAddress);
            onSelectRef.current(addr);
          }
        };

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace() as PlaceResult;
          fillFromPlace(place);
        });
      })
      .catch(() => setUnavailable(true));

    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [componentRestrictions]);

  if (unavailable) {
    return (
      <label style={{ display: "block", marginBottom: "8px", ...style }}>
        <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>{label}</span>
        <input
          type="text"
          id={id}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(148, 163, 184, 0.7)",
            fontSize: "14px",
          }}
        />
      </label>
    );
  }

  return (
    <label style={{ display: "block", marginBottom: "8px", ...style }}>
      <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>{label}</span>
      <input
        ref={inputRef}
        type="text"
        id={id}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(148, 163, 184, 0.7)",
          fontSize: "14px",
        }}
      />
    </label>
  );
};

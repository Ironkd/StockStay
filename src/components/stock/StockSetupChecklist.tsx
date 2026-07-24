import React from "react";
import type { Property } from "../../types";

type Props = {
  visibleProperties: Property[];
  hasPropertyWithClient: boolean;
  hasLocationLink: boolean;
  hasSkuOnHand: boolean;
  stockLocationCount: number;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onOpenLocationModal: () => void;
  onOpenLinkModal: () => void;
};

export const StockSetupChecklist: React.FC<Props> = ({
  visibleProperties,
  hasPropertyWithClient,
  hasLocationLink,
  hasSkuOnHand,
  stockLocationCount,
  onAddProperty,
  onEditProperty,
  onOpenLocationModal,
  onOpenLinkModal,
}) => (
  <section className="stock-checklist">
    <h3>Setup checklist</h3>
    <ul>
      <li>
        <span className={visibleProperties.length > 0 ? "ok" : "todo"}>
          {visibleProperties.length > 0 ? "✓" : "○"} Property
        </span>
        {visibleProperties.length === 0 && (
          <button type="button" className="linkish" onClick={onAddProperty}>
            Add property…
          </button>
        )}
      </li>
      <li>
        <span className={hasPropertyWithClient ? "ok" : "todo"}>
          {hasPropertyWithClient ? "✓" : "○"} Billing client on a property
        </span>
        {!hasPropertyWithClient && visibleProperties[0] && (
          <button
            type="button"
            className="linkish"
            onClick={() => onEditProperty(visibleProperties[0])}
          >
            Edit property…
          </button>
        )}
        {!hasPropertyWithClient && visibleProperties.length === 0 && (
          <button type="button" className="linkish" onClick={onAddProperty}>
            Add property…
          </button>
        )}
      </li>
      <li>
        <span className={hasLocationLink ? "ok" : "todo"}>
          {hasLocationLink ? "✓" : "○"} Location linked to a property
        </span>
        {!hasLocationLink && (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              if (stockLocationCount === 0) onOpenLocationModal();
              else onOpenLinkModal();
            }}
          >
            {stockLocationCount === 0 ? "Add stock location…" : "Link…"}
          </button>
        )}
      </li>
      <li>
        <span className={hasSkuOnHand ? "ok" : "todo"}>
          {hasSkuOnHand ? "✓" : "○"} Packs on hand at a stock location
        </span>
        {!hasSkuOnHand && (
          <span style={{ color: "#64748b", fontSize: "13px" }}>
            Receive packs on a SKU at a stock location (catalogue receive API).
          </span>
        )}
      </li>
    </ul>
  </section>
);

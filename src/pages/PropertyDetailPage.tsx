import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  PropertyFormValues,
  Replenishment,
  StockLocation,
  UnbilledLine,
} from "../types";
import { useProperties } from "../hooks/useProperties";
import { PropertyForm } from "../components/PropertyForm";
import { ReplenishModal } from "../components/ReplenishModal";
import { ReturnStockModal } from "../components/ReturnStockModal";
import { TransferStockModal } from "../components/TransferStockModal";
import { clientsApi } from "../services/clientsApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { useAuth } from "../contexts/useAuth";
import { SectionHeader } from "../components/ui/SectionHeader";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, canWrite } = useAuth();
  const {
    properties,
    isLoaded: propertiesLoaded,
    updateProperty,
    getPropertyById,
    refresh: refreshProperties,
  } = useProperties();

  const [clients, setClients] = useState<Client[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [recentMoves, setRecentMoves] = useState<Replenishment[]>([]);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkLocationId, setLinkLocationId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [replenishSupplyItemId, setReplenishSupplyItemId] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const property = getPropertyById(id);

  const canAccessProperty = useMemo(() => {
    if (!property || !user) return false;
    if (user.teamRole === "owner") return true;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) return true;
    return user.allowedPropertyIds.includes(property.id);
  }, [property, user]);

  useEffect(() => {
    if (propertiesLoaded && property && !canAccessProperty) {
      navigate("/properties", { replace: true });
    }
  }, [propertiesLoaded, property, canAccessProperty, navigate]);

  const refreshAll = useCallback(async () => {
    try {
      const [locs, reps, unbilled] = await Promise.all([
        stockLocationsApi.getAll(),
        replenishmentApi.list({ limit: 200, propertyId: id }),
        replenishmentApi.listUnbilled(),
      ]);
      setStockLocations(locs);
      setRecentMoves(reps);
      setUnbilledLines(unbilled);
    } catch {
      setStockLocations([]);
      setRecentMoves([]);
      setUnbilledLines([]);
    }
  }, [id]);

  useEffect(() => {
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
    refreshAll();
  }, [id, refreshAll]);

  const handleStockFlowSuccess = () => {
    refreshAll();
  };

  const propertyHistory = useMemo(
    () => recentMoves.filter((r) => r.propertyId === id),
    [recentMoves, id]
  );

  const propertyMoves = useMemo(() => propertyHistory.slice(0, 15), [propertyHistory]);

  const propertyUnbilled = useMemo(
    () => unbilledLines.filter((line) => line.property?.id === id),
    [unbilledLines, id]
  );

  const allocatedSupplyItems = useMemo(() => {
    const bySupplyItem = new Map<
      string,
      { id: string; name: string; baseQty: number; skuNames: Set<string> }
    >();
    for (const line of propertyUnbilled) {
      const sign = line.isCredit || line.direction === "return" ? -1 : 1;
      const id = line.supplyItemId;
      const current = bySupplyItem.get(id) || {
        id,
        name: line.supplyItem?.name || "Supply item",
        baseQty: 0,
        skuNames: new Set<string>(),
      };
      current.baseQty += sign * (Number(line.baseQtyDeployed) || 0);
      if (line.sku?.name) current.skuNames.add(line.sku.name);
      bySupplyItem.set(id, current);
    }
    return Array.from(bySupplyItem.values())
      .filter((item) => item.baseQty > 0.000001)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [propertyUnbilled]);

  const linkedLocations = useMemo(
    () => stockLocations.filter((loc) => (loc.properties || []).some((p) => p.propertyId === id)),
    [stockLocations, id]
  );

  const unbilledTotals = useMemo(() => {
    let charges = 0;
    let credits = 0;
    for (const line of propertyUnbilled) {
      const amt = Number(line.billBackAmount) || 0;
      if (amt >= 0) charges += amt;
      else credits += amt;
    }
    return { charges, credits, net: charges + credits };
  }, [propertyUnbilled]);

  const handlePropertySubmit = async (values: PropertyFormValues) => {
    if (!property) return;
    try {
      await updateProperty(property.id, values);
      setShowEditModal(false);
      await refreshProperties();
    } catch {
      // keep modal open; error already tracked in useProperties
    }
  };

  const handleLinkLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkLocationId || !id) {
      setLinkError("Select a stock location.");
      return;
    }
    setLinkBusy(true);
    setLinkError("");
    try {
      await stockLocationsApi.linkProperty(linkLocationId, id);
      setShowLinkModal(false);
      setLinkLocationId("");
      await refreshAll();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link location");
    } finally {
      setLinkBusy(false);
    }
  };

  if (!propertiesLoaded) {
    return (
      <div className="inventory-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (!property || !canAccessProperty) {
    return (
      <div className="inventory-page">
        <div className="empty-state">
          <h3>Property not found</h3>
          <p>
            <Link to="/properties">Back to properties</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <div style={{ marginBottom: "8px" }}>
        <Link to="/properties" style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none" }}>
          ← All properties
        </Link>
      </div>

      <SectionHeader
        title={property.name}
        description={
          <>
            {property.location || "—"}
            <br />
            Client:{" "}
            {clients.find((c) => c.id === property.clientId)?.name || (
              <span style={{ color: "#b45309" }}>None assigned</span>
            )}
            {property.markupPercentage != null && property.markupPercentage !== "" && (
              <span style={{ color: "#64748b" }}> · Markup override {String(property.markupPercentage)}%</span>
            )}
          </>
        }
        actions={
          canWrite ? (
            <>
            <button type="button" className="secondary" onClick={() => setShowEditModal(true)}>
              Edit property
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLinkLocationId("");
                setLinkError("");
                setShowLinkModal(true);
              }}
            >
              Link location
            </button>
            </>
          ) : null
        }
      />

      {!property.clientId && (
        <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: "13px", marginBottom: "16px" }}>
          This property has no billing client. Assign one via Edit property before replenishing — bill-back can&apos;t be
          queued without a client.
        </div>
      )}

      <div className="stock-toolbar property-secondary-actions">
        {canWrite && (
          <>
            <button type="button" className="add-property-button" onClick={() => setShowReturnModal(true)}>
              Return
            </button>
            <button type="button" className="add-property-button" onClick={() => setShowTransferModal(true)}>
              Transfer
            </button>
          </>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => navigate(`/billing?propertyId=${property.id}`)}
        >
          View on Billing
        </button>
      </div>

      <section className="panel property-allocation-panel">
        <SectionHeader
          title="Allocated supplies"
          description="See what has been allocated since the last invoice, then replenish an item without re-selecting the property."
          compact
        />
        {allocatedSupplyItems.length === 0 ? (
          <div className="empty-state">
            <h3>No unbilled allocations</h3>
            <p>Choose a supply item from a linked stock location to allocate stock for the next invoice.</p>
            {canWrite && linkedLocations.length > 0 ? (
              <button
                type="button"
                className="add-property-button"
                onClick={() => {
                  setReplenishSupplyItemId("");
                  setShowReplenishModal(true);
                }}
              >
                Allocate stock
              </button>
            ) : null}
          </div>
        ) : (
          <div className="property-supply-grid">
            {allocatedSupplyItems.map((item) => (
              <article key={item.id} className="property-supply-card">
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.baseQty.toFixed(2)} base units since last invoice
                    {item.skuNames.size > 0 ? ` · ${Array.from(item.skuNames).join(", ")}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setReplenishSupplyItemId(item.id);
                      setShowReplenishModal(true);
                    }}
                  >
                    Allocate more
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Unbilled lines ({propertyUnbilled.length})</h3>
          <Link to={`/billing?propertyId=${property.id}`} style={{ fontSize: "13px" }}>
            View on Billing →
          </Link>
        </div>
        {propertyUnbilled.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No unbilled charges or credits for this property.</p>
        ) : (
          <>
            <p style={{ fontSize: "14px" }}>
              Charges ${unbilledTotals.charges.toFixed(2)} · Credits ${unbilledTotals.credits.toFixed(2)} · Net $
              {unbilledTotals.net.toFixed(2)}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyUnbilled.map((line) => (
                    <tr key={line.id}>
                      <td>{line.isCredit ? "Credit" : "Charge"}</td>
                      <td>{line.supplyItem?.name || line.sku?.name || "—"}</td>
                      <td>{Number(line.baseQtyDeployed).toFixed(2)}</td>
                      <td style={{ color: line.isCredit ? "#b91c1c" : undefined }}>
                        ${Number(line.billBackAmount).toFixed(2)}
                      </td>
                      <td>{new Date(line.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Recent moves</h3>
        {propertyMoves.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No replenishments, returns, or transfers yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px" }}>
            {propertyMoves.map((r) => {
              const isTransfer = !!r.transferGroupId;
              const label = isTransfer ? (r.direction === "return" ? "transfer out" : "transfer in") : r.direction;
              return (
                <li key={r.id}>
                  <strong>{label}</strong>
                  {isTransfer ? " · pass-through" : ""} · {r.stockLocation?.name || "Location"} ·{" "}
                  {(r.lines || []).length} line(s) · {new Date(r.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Edit property</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <PropertyForm
              key={property.id}
              initialValues={property}
              clients={clients}
              stockLocations={stockLocations}
              onSubmit={handlePropertySubmit}
              onCancel={() => setShowEditModal(false)}
            />
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal-overlay" onClick={() => !linkBusy && setShowLinkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Link stock location</h3>
            <form className="inventory-form" onSubmit={handleLinkLocation}>
              <label>
                <span>Stock location *</span>
                <select value={linkLocationId} onChange={(e) => setLinkLocationId(e.target.value)} required>
                  <option value="">Select…</option>
                  {stockLocations
                    .filter((loc) => !linkedLocations.some((l) => l.id === loc.id))
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                </select>
              </label>
              {linkError && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{linkError}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowLinkModal(false)} disabled={linkBusy}>
                  Cancel
                </button>
                <button type="submit" disabled={linkBusy}>
                  {linkBusy ? "Linking…" : "Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReplenishModal && (
        <ReplenishModal
          properties={properties}
          clients={clients}
          stockLocations={stockLocations}
          initialPropertyId={property.id}
          initialSupplyItemId={replenishSupplyItemId || undefined}
          onClose={() => setShowReplenishModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {showReturnModal && (
        <ReturnStockModal
          onClose={() => setShowReturnModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {showTransferModal && (
        <TransferStockModal
          properties={properties}
          clients={clients}
          stockLocations={stockLocations}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}
    </div>
  );
};

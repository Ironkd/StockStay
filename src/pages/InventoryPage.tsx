import React, { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  InventoryItem,
  InventoryItemFormValues,
  Property,
  PropertyFormValues,
  Category,
  CategoryFormValues,
  Client,
  PropertyStock,
  Replenishment,
  StockLocation,
} from "../types";
import { useInventory } from "../hooks/useInventory";
import { useProperties } from "../hooks/useProperties";
import { useCategories } from "../hooks/useCategories";
import { InventoryForm } from "../components/InventoryForm";
import { PropertyForm } from "../components/PropertyForm";
import { SubtractItemModal } from "../components/SubtractItemModal";
import { AddQuantityModal } from "../components/AddQuantityModal";
import { ReplenishModal } from "../components/ReplenishModal";
import { ReturnStockModal } from "../components/ReturnStockModal";
import { TransferStockModal } from "../components/TransferStockModal";
import { StockSetupChecklist } from "../components/stock/StockSetupChecklist";
import { PropertyStockPanel } from "../components/stock/PropertyStockPanel";
import { LegacyItemsSection } from "../components/stock/LegacyItemsSection";
import { CategoryManageModal } from "../components/stock/CategoryManageModal";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";
import { clientsApi } from "../services/clientsApi";
import { propertyStocksApi, skusApi } from "../services/catalogueApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { replenishmentApi } from "../services/replenishmentApi";

export const InventoryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [maxProperties, setMaxProperties] = useState<number>(1);
  const [teamLimitsLoaded, setTeamLimitsLoaded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const {
    items,
    addItem,
    updateItem,
    removeItem,
    exportToCsv,
    refresh: refreshInventory,
  } = useInventory();

  const {
    properties,
    addProperty,
    updateProperty,
    removeProperty,
    getPropertyById,
    refresh: refreshProperties,
  } = useProperties();

  const {
    categories,
    addCategory,
    updateCategory,
    removeCategory,
  } = useCategories();

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [subtractItem, setSubtractItem] = useState<InventoryItem | null>(null);
  const [addQuantityItem, setAddQuantityItem] = useState<InventoryItem | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [propertyStocks, setPropertyStocks] = useState<PropertyStock[]>([]);
  const [recentReplenishments, setRecentReplenishments] = useState<Replenishment[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [hasSkuOnHand, setHasSkuOnHand] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [linkLocationId, setLinkLocationId] = useState("");
  const [linkPropertyId, setLinkPropertyId] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [activePropertyTab, setActivePropertyTab] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    teamApi.getTeamLimits().then((data) => {
      if (!cancelled && data.effectiveMaxProperties != null) {
        setMaxProperties(data.effectiveMaxProperties);
        setTeamLimitsLoaded(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
  }, []);

  const refreshStockFlows = async () => {
    try {
      const [stocks, reps, locs, skus] = await Promise.all([
        propertyStocksApi.getAll(),
        replenishmentApi.list({ limit: 15 }),
        stockLocationsApi.getAll(),
        skusApi.getAll(),
      ]);
      setPropertyStocks(stocks);
      setRecentReplenishments(reps);
      setStockLocations(locs);
      setHasSkuOnHand(
        skus.some((s) => s.stockOnHand && Number(s.stockOnHand.quantity) > 0)
      );
    } catch {
      setPropertyStocks([]);
      setRecentReplenishments([]);
      setStockLocations([]);
      setHasSkuOnHand(false);
    }
  };

  useEffect(() => {
    refreshStockFlows();
  }, []);

  const handleStockFlowSuccess = () => {
    refreshStockFlows();
    refreshInventory();
  };

  useEffect(() => {
    if (!showAddMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showAddMenu]);

  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam === "low-stock" || statusParam === "out-of-stock") {
      setStatusFilter(statusParam);
    } else if (!statusParam) {
      setStatusFilter("all");
    }
  }, [searchParams]);

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    const newSearchParams = new URLSearchParams(searchParams);
    if (value === "low-stock" || value === "out-of-stock") {
      newSearchParams.set("status", value);
    } else {
      newSearchParams.delete("status");
    }
    setSearchParams(newSearchParams, { replace: true });
  };

  const categoriesFromItems = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))),
    [items]
  );

  const allCategories = useMemo(() => {
    const managedCategoryNames = new Set(categories.map((c) => c.name));
    const itemCategoryNames = categoriesFromItems.filter((cat) => !managedCategoryNames.has(cat));
    return [...categories.map((c) => c.name), ...itemCategoryNames];
  }, [categories, categoriesFromItems]);

  const visibleProperties = useMemo(() => {
    if (!user) return properties;
    if (user.teamRole === "owner") return properties;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) {
      return properties;
    }
    return properties.filter((w) => user.allowedPropertyIds!.includes(w.id));
  }, [user, properties]);

  useEffect(() => {
    if (activePropertyTab === null) {
      setActivePropertyTab("all");
    } else if (
      activePropertyTab !== "all" &&
      visibleProperties.length > 0 &&
      !visibleProperties.find((w) => w.id === activePropertyTab)
    ) {
      setActivePropertyTab("all");
    }
  }, [visibleProperties, activePropertyTab]);

  const filteredItems = useMemo(() => {
    const allowedPropertyIds =
      user && user.teamRole !== "owner" && user.allowedPropertyIds && user.allowedPropertyIds.length > 0
        ? new Set(user.allowedPropertyIds)
        : null;

    return items.filter((item) => {
      if (allowedPropertyIds !== null) {
        if (!item.propertyId || !allowedPropertyIds.has(item.propertyId)) return false;
      }

      const matchesProperty =
        activePropertyTab === "all" || activePropertyTab === null
          ? true
          : item.propertyId === activePropertyTab;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "in-stock" && item.quantity > 0) ||
        (statusFilter === "out-of-stock" && item.quantity === 0) ||
        (statusFilter === "low-stock" &&
          item.quantity > 0 &&
          item.quantity <= item.reorderPoint);

      return matchesProperty && matchesStatus;
    });
  }, [items, activePropertyTab, statusFilter, user]);

  const hasPropertyWithClient = visibleProperties.some((p) => !!p.clientId);
  const hasLocationLink = stockLocations.some(
    (loc) => (loc.properties || []).some((p) => visibleProperties.some((vp) => vp.id === p.propertyId))
  );
  const showSetupChecklist =
    visibleProperties.length === 0 ||
    !hasPropertyWithClient ||
    !hasLocationLink ||
    !hasSkuOnHand;

  const filteredPropertyStocks = useMemo(() => {
    if (activePropertyTab === "all" || activePropertyTab === null) {
      return propertyStocks.filter((row) =>
        !row.propertyId || visibleProperties.some((p) => p.id === row.propertyId)
      );
    }
    return propertyStocks.filter((row) => row.propertyId === activePropertyTab);
  }, [propertyStocks, activePropertyTab, visibleProperties]);

  const openLegacyAnd = (fn: () => void) => {
    setLegacyOpen(true);
    setShowAddMenu(false);
    fn();
  };

  const openLinkModal = () => {
    setLinkPropertyId(
      activePropertyTab && activePropertyTab !== "all" ? activePropertyTab : ""
    );
    setShowLinkModal(true);
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      alert("Stock location name is required.");
      return;
    }
    setSetupBusy(true);
    try {
      const created = await stockLocationsApi.create({
        name: locationName.trim(),
        address: locationAddress.trim() || null,
      });
      setShowLocationModal(false);
      setLocationName("");
      setLocationAddress("");
      await refreshStockFlows();
      if (activePropertyTab && activePropertyTab !== "all") {
        if (window.confirm(`Link "${created.name}" to the selected property?`)) {
          await stockLocationsApi.linkProperty(created.id, activePropertyTab);
          await refreshStockFlows();
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create stock location");
    } finally {
      setSetupBusy(false);
    }
  };

  const handleLinkLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkLocationId || !linkPropertyId) {
      alert("Select a stock location and property.");
      return;
    }
    setSetupBusy(true);
    try {
      await stockLocationsApi.linkProperty(linkLocationId, linkPropertyId);
      setShowLinkModal(false);
      setLinkLocationId("");
      setLinkPropertyId("");
      await refreshStockFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to link location");
    } finally {
      setSetupBusy(false);
    }
  };

  const handleSubmit = (values: InventoryItemFormValues | InventoryItemFormValues[]) => {
    if (editingItem) {
      if (Array.isArray(values)) {
        alert("Cannot edit multiple items at once.");
        return;
      }
      updateItem(editingItem.id, values);
      setEditingItem(null);
    } else {
      addItem(values);
    }
    setShowInventoryModal(false);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setShowInventoryModal(true);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setShowInventoryModal(false);
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setShowInventoryModal(true);
  };

  const handlePropertySubmit = async (values: PropertyFormValues) => {
    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, values);
        setEditingProperty(null);
      } else {
        await addProperty(values);
      }
      setShowPropertyModal(false);
      await refreshProperties();
    } catch {
      // Error already set in useProperties; keep modal open
    }
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property);
    setShowPropertyModal(true);
  };

  const handleCancelPropertyEdit = () => {
    setEditingProperty(null);
    setShowPropertyModal(false);
  };

  const handleAddProperty = () => {
    if (teamLimitsLoaded && properties.length >= maxProperties) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingProperty(null);
    setShowPropertyModal(true);
  };

  const handleDeleteProperty = async (id: string) => {
    const property = properties.find((w) => w.id === id);
    if (!property) return;

    const itemsInProperty = items.filter((item) => item.propertyId === id);
    const itemCount = itemsInProperty.length;

    let message = `Are you sure you want to delete the property "${property.name}"?`;
    if (itemCount > 0) {
      message += `\n\n⚠️ WARNING: This property has ${itemCount} item(s) assigned to it. Deleting this property will remove the property assignment from these items.`;
    }
    message += "\n\nThis action cannot be undone.";

    if (!window.confirm(message)) {
      return;
    }

    try {
      await removeProperty(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete property");
    }
  };

  const handleSubtractSubmit = async (item: InventoryItem, quantity: number) => {
    await updateItem(item.id, {
      name: item.name,
      sku: item.sku,
      category: item.category,
      location: item.location,
      propertyId: item.propertyId,
      quantity: Math.max(0, item.quantity - quantity),
      unit: item.unit,
      reorderPoint: item.reorderPoint,
      reorderQuantity: item.reorderQuantity ?? 0,
      priceBoughtFor: item.priceBoughtFor,
      markupPercentage: item.markupPercentage,
      finalPrice: item.finalPrice,
      tags: item.tags,
      notes: item.notes,
    });
  };

  const handleAddQuantitySubmit = async (item: InventoryItem, quantity: number) => {
    await updateItem(item.id, {
      name: item.name,
      sku: item.sku,
      category: item.category,
      location: item.location,
      propertyId: item.propertyId,
      quantity: item.quantity + quantity,
      unit: item.unit,
      reorderPoint: item.reorderPoint,
      reorderQuantity: item.reorderQuantity ?? 0,
      priceBoughtFor: item.priceBoughtFor,
      markupPercentage: item.markupPercentage,
      finalPrice: item.finalPrice,
      tags: item.tags,
      notes: item.notes,
    });
  };

  const handleEditCategory = (categoryName: string, categoryId?: string) => {
    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        setEditingCategory(category);
        return;
      }
    }
    setEditingCategory({
      id: categoryName,
      name: categoryName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Category);
  };

  const handleCancelCategoryEdit = () => {
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (categoryName: string, categoryId?: string) => {
    const itemsInCategory = items.filter((item) => item.category === categoryName);
    const itemCount = itemsInCategory.length;

    let message = `Are you sure you want to delete the category "${categoryName}"?`;
    if (itemCount > 0) {
      message += `\n\n⚠️ WARNING: This category has ${itemCount} item(s) assigned to it. Deleting this category will remove the category assignment from these items.`;
    }
    message += "\n\nThis action cannot be undone.";

    if (!window.confirm(message)) {
      return;
    }

    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        removeCategory(categoryId);
      }
    }

    try {
      await Promise.all(
        itemsInCategory.map((item) => updateItem(item.id, { ...item, category: "" }))
      );
    } catch (err) {
      console.error("Error removing category from items:", err);
      alert("Some items could not be updated. Please try again.");
    }
  };

  const handleCategorySubmit = async (values: CategoryFormValues | CategoryFormValues[]) => {
    if (editingCategory) {
      if (Array.isArray(values)) {
        alert("Cannot edit multiple categories at once.");
        return;
      }

      const isManagedCategory = categories.find((c) => c.id === editingCategory.id);

      if (isManagedCategory) {
        updateCategory(editingCategory.id, values);
      } else {
        const categoryExists = categories.find((c) => c.name === values.name);
        if (!categoryExists) {
          addCategory(values);
        }
      }

      const itemsWithOldCategory = items.filter((item) => item.category === editingCategory.name);
      if (itemsWithOldCategory.length > 0) {
        try {
          await Promise.all(
            itemsWithOldCategory.map((item) =>
              updateItem(item.id, { ...item, category: values.name })
            )
          );
        } catch (err) {
          console.error("Error updating items with new category:", err);
          alert("Category updated, but some items could not be updated. Please try again.");
        }
      }

      setEditingCategory(null);
    } else {
      if (Array.isArray(values)) {
        values.forEach((category) => addCategory(category));
      } else {
        addCategory(values);
      }
    }
  };

  const openCategoryModal = () => {
    setEditingCategory(null);
    setShowCategoryModal(true);
  };

  return (
    <div className="inventory-page">
      <h2>Stock</h2>
      <p style={{ marginTop: "-8px", marginBottom: "16px", color: "#64748b", fontSize: "14px" }}>
        Stock location packs → property base units → unbilled bill-back
      </p>

      <div className="stock-toolbar">
        <button
          type="button"
          className="add-property-button"
          onClick={() => setShowReplenishModal(true)}
        >
          Replenish
        </button>
        <button
          type="button"
          className="add-property-button"
          onClick={() => setShowReturnModal(true)}
        >
          Return
        </button>
        <button
          type="button"
          className="add-property-button"
          onClick={() => setShowTransferModal(true)}
        >
          Transfer
        </button>
        <div className="stock-add-menu" ref={addMenuRef}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowAddMenu((v) => !v)}
            aria-expanded={showAddMenu}
            aria-haspopup="menu"
          >
            Add new ▾
          </button>
          {showAddMenu && (
            <div className="stock-add-menu-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowAddMenu(false);
                  handleAddProperty();
                }}
              >
                Property
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowAddMenu(false);
                  setShowLocationModal(true);
                }}
              >
                Stock location
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowAddMenu(false);
                  openLinkModal();
                }}
              >
                Link location ↔ property
              </button>
              <div className="stock-add-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={() => openLegacyAnd(handleAddItem)}
              >
                Legacy item
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => openLegacyAnd(openCategoryModal)}
              >
                Categories
              </button>
            </div>
          )}
        </div>
      </div>

      {showUpgradeModal && (
        <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3>Property limit reached</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowUpgradeModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ marginBottom: "20px" }}>
              You can&apos;t add more properties on your current plan (limit: {maxProperties}). Click below to upgrade your plan and get more properties.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className="secondary" onClick={() => setShowUpgradeModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setShowUpgradeModal(false);
                  navigate("/settings");
                }}
              >
                Upgrade your plan
              </button>
            </div>
          </div>
        </div>
      )}

      {showPropertyModal && (
        <div className="modal-overlay" onClick={handleCancelPropertyEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>{editingProperty ? "Edit Property" : "Add property"}</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={handleCancelPropertyEdit}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <PropertyForm
              key={editingProperty ? editingProperty.id : "new"}
              initialValues={editingProperty ?? undefined}
              clients={clients}
              onSubmit={handlePropertySubmit}
              onCancel={handleCancelPropertyEdit}
            />
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="modal-overlay" onClick={() => !setupBusy && setShowLocationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Add stock location</h3>
            <form className="inventory-form" onSubmit={handleCreateLocation}>
              <label>
                <span>Name *</span>
                <input
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Central Supply"
                  required
                />
              </label>
              <label>
                <span>Address</span>
                <input
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowLocationModal(false)} disabled={setupBusy}>
                  Cancel
                </button>
                <button type="submit" disabled={setupBusy}>
                  {setupBusy ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal-overlay" onClick={() => !setupBusy && setShowLinkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Link location ↔ property</h3>
            <form className="inventory-form" onSubmit={handleLinkLocation}>
              <label>
                <span>Stock location *</span>
                <select value={linkLocationId} onChange={(e) => setLinkLocationId(e.target.value)} required>
                  <option value="">Select…</option>
                  {stockLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Property *</span>
                <select value={linkPropertyId} onChange={(e) => setLinkPropertyId(e.target.value)} required>
                  <option value="">Select…</option>
                  {visibleProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowLinkModal(false)} disabled={setupBusy}>
                  Cancel
                </button>
                <button type="submit" disabled={setupBusy}>
                  {setupBusy ? "Linking…" : "Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSetupChecklist && (
        <StockSetupChecklist
          visibleProperties={visibleProperties}
          hasPropertyWithClient={hasPropertyWithClient}
          hasLocationLink={hasLocationLink}
          hasSkuOnHand={hasSkuOnHand}
          stockLocationCount={stockLocations.length}
          onAddProperty={handleAddProperty}
          onEditProperty={handleEditProperty}
          onOpenLocationModal={() => setShowLocationModal(true)}
          onOpenLinkModal={openLinkModal}
        />
      )}

      <section className="panel">
        <PropertyStockPanel
          activePropertyTab={activePropertyTab}
          onActivePropertyTabChange={setActivePropertyTab}
          visibleProperties={visibleProperties}
          propertyStocks={propertyStocks}
          filteredPropertyStocks={filteredPropertyStocks}
          recentReplenishments={recentReplenishments}
          getPropertyById={getPropertyById}
          onEditProperty={handleEditProperty}
          onDeleteProperty={handleDeleteProperty}
        />
        <LegacyItemsSection
          legacyOpen={legacyOpen}
          onLegacyOpenChange={setLegacyOpen}
          items={items}
          filteredItems={filteredItems}
          visibleProperties={visibleProperties}
          onAddItem={handleAddItem}
          onOpenCategoryModal={openCategoryModal}
          onExportCsv={exportToCsv}
          onEdit={handleEdit}
          onDelete={removeItem}
          onAddQuantity={setAddQuantityItem}
          onSubtract={setSubtractItem}
        />
      </section>

      {showInventoryModal && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>{editingItem ? "Edit Item" : "Add New Item"}</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={handleCancelEdit}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <InventoryForm
              key={editingItem ? editingItem.id : "new"}
              initialValues={editingItem ?? undefined}
              properties={visibleProperties}
              categories={allCategories}
              onSubmit={handleSubmit}
              onCancel={handleCancelEdit}
            />
          </div>
        </div>
      )}

      {showReplenishModal && (
        <ReplenishModal
          properties={visibleProperties}
          clients={clients}
          stockLocations={stockLocations}
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
          properties={visibleProperties}
          clients={clients}
          propertyStocks={propertyStocks}
          stockLocations={stockLocations}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {subtractItem && (
        <SubtractItemModal
          item={subtractItem}
          onClose={() => setSubtractItem(null)}
          onSubmit={async (quantity) => {
            await handleSubtractSubmit(subtractItem, quantity);
          }}
        />
      )}

      {addQuantityItem && (
        <AddQuantityModal
          item={addQuantityItem}
          onClose={() => setAddQuantityItem(null)}
          onSubmit={async (quantity) => {
            await handleAddQuantitySubmit(addQuantityItem, quantity);
          }}
        />
      )}

      {showCategoryModal && (
        <CategoryManageModal
          editingCategory={editingCategory}
          categories={categories}
          allCategories={allCategories}
          items={items}
          onClose={() => setShowCategoryModal(false)}
          onCategorySubmit={handleCategorySubmit}
          onCancelCategoryEdit={handleCancelCategoryEdit}
          onEditCategory={handleEditCategory}
          onDeleteCategory={handleDeleteCategory}
          onEditingCategoryClear={() => setEditingCategory(null)}
        />
      )}
    </div>
  );
};

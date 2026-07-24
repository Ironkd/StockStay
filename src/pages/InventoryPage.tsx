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
import { CategoryForm } from "../components/CategoryForm";
import { InventoryTable } from "../components/InventoryTable";
import { SummaryBar } from "../components/SummaryBar";
import { SubtractItemModal } from "../components/SubtractItemModal";
import { AddQuantityModal } from "../components/AddQuantityModal";
import { ReplenishModal } from "../components/ReplenishModal";
import { ReturnStockModal } from "../components/ReturnStockModal";
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
    clearAll,
    importFromJson,
    exportToCsv,
    exportToCsvItems,
    refresh: refreshInventory
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
    removeCategory
  } = useCategories();

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
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
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Load team property limit (Pro trial = 10, Starter = 3, free = 1). Use /team/limits so we don't need settings access.
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

  // Load clients for property billing fields
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

  // Read status filter from URL params on mount and when params change
  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam === "low-stock" || statusParam === "out-of-stock") {
      setStatusFilter(statusParam);
    } else if (!statusParam) {
      // If no status param, reset to "all"
      setStatusFilter("all");
    }
  }, [searchParams]);

  // Update URL when status filter changes (except when it's set from URL)
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
  
  // Combine managed categories with categories from items (for backward compatibility)
  const allCategories = useMemo(() => {
    const managedCategoryNames = new Set(categories.map(c => c.name));
    const itemCategoryNames = categoriesFromItems.filter(cat => !managedCategoryNames.has(cat));
    return [...categories.map(c => c.name), ...itemCategoryNames];
  }, [categories, categoriesFromItems]);
  const locations = useMemo(
    () => Array.from(new Set(items.map((i) => i.location).filter(Boolean))),
    [items]
  );

  // Apply property visibility restrictions: invited members see only properties the owner picked (empty = all)
  const visibleProperties = useMemo(() => {
    if (!user) return properties;
    if (user.teamRole === "owner") return properties;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) {
      return properties;
    }
    return properties.filter((w) => user.allowedPropertyIds!.includes(w.id));
  }, [user, properties]);

  // Set default active tab to "all" to show all products
  useEffect(() => {
    if (activePropertyTab === null) {
      setActivePropertyTab("all");
    } else if (
      activePropertyTab !== "all" &&
      activePropertyTab !== "unassigned" &&
      visibleProperties.length > 0 &&
      !visibleProperties.find((w) => w.id === activePropertyTab)
    ) {
      // If the active property was deleted, switch to "all"
      setActivePropertyTab("all");
    }
  }, [properties, activePropertyTab]);

  const filteredItems = useMemo(() => {
    // Members: only filter by property when owner explicitly picked some; empty = see all
    const allowedPropertyIds =
      user && user.teamRole !== "owner" && user.allowedPropertyIds && user.allowedPropertyIds.length > 0
        ? new Set(user.allowedPropertyIds)
        : null;

    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      // Enforce property-level visibility: members only see items in allowed properties (when restricted)
      if (allowedPropertyIds !== null) {
        if (!item.propertyId || !allowedPropertyIds.has(item.propertyId)) return false;
      }

      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.sku.toLowerCase().includes(normalizedSearch) ||
        (item.category &&
          item.category.toLowerCase().includes(normalizedSearch)) ||
        (item.location &&
          item.location.toLowerCase().includes(normalizedSearch));

      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const matchesLocation =
        locationFilter === "all" || item.location === locationFilter;
      const matchesProperty =
        activePropertyTab === "all" || activePropertyTab === null
          ? true
          : activePropertyTab === "unassigned"
          ? !item.propertyId
          : item.propertyId === activePropertyTab;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "in-stock" && item.quantity > 0) ||
        (statusFilter === "out-of-stock" && item.quantity === 0) ||
        (statusFilter === "low-stock" &&
          item.quantity > 0 &&
          item.quantity <= item.reorderPoint);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesLocation &&
        matchesProperty &&
        matchesStatus
      );
    });
  }, [
    items,
    search,
    categoryFilter,
    locationFilter,
    activePropertyTab,
    statusFilter,
    user
  ]);


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
    if (activePropertyTab === "all" || activePropertyTab === null || activePropertyTab === "unassigned") {
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
      if (activePropertyTab && activePropertyTab !== "all" && activePropertyTab !== "unassigned") {
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
    // Only block when we've loaded limits from the server (Pro trial = 10, so we don't block at 1 incorrectly)
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
    // If it's a managed category, find it by ID
    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        setEditingCategory(category);
        return;
      }
    }
    // If it's a category from items, create a temporary category object for editing
    setEditingCategory({
      id: categoryName, // Use name as ID for item-based categories
      name: categoryName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as Category);
  };

  const handleCancelCategoryEdit = () => {
    setEditingCategory(null);
  };

  const handleAddCategory = () => {
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
    
    // If it's a managed category, delete it
    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        removeCategory(categoryId);
      }
    }
    
    // Remove category from all items
    try {
      await Promise.all(
        itemsInCategory.map(item => 
          updateItem(item.id, { ...item, category: "" })
        )
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
      
      // Check if this is a managed category (has proper ID) or item-based category
      const isManagedCategory = categories.find((c) => c.id === editingCategory.id);
      
      if (isManagedCategory) {
        // Update managed category
        updateCategory(editingCategory.id, values);
      } else {
        // Also create a managed category with the new name if it doesn't exist
        const categoryExists = categories.find((c) => c.name === values.name);
        if (!categoryExists) {
          addCategory(values);
        }
      }
      
      // Update all items that use the old category name
      const itemsWithOldCategory = items.filter((item) => item.category === editingCategory.name);
      if (itemsWithOldCategory.length > 0) {
        try {
          await Promise.all(
            itemsWithOldCategory.map(item => 
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
        // Bulk add
        values.forEach(category => addCategory(category));
      } else {
        // Single add
        addCategory(values);
      }
    }
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
                  setLinkPropertyId(
                    activePropertyTab && activePropertyTab !== "all" && activePropertyTab !== "unassigned"
                      ? activePropertyTab
                      : ""
                  );
                  setShowLinkModal(true);
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
                onClick={() =>
                  openLegacyAnd(() => {
                    setEditingCategory(null);
                    setShowCategoryModal(true);
                  })
                }
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
        <section className="stock-checklist">
          <h3>Setup checklist</h3>
          <ul>
            <li>
              <span className={visibleProperties.length > 0 ? "ok" : "todo"}>
                {visibleProperties.length > 0 ? "✓" : "○"} Property
              </span>
              {visibleProperties.length === 0 && (
                <button type="button" className="linkish" onClick={handleAddProperty}>
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
                  onClick={() => handleEditProperty(visibleProperties[0])}
                >
                  Edit property…
                </button>
              )}
              {!hasPropertyWithClient && visibleProperties.length === 0 && (
                <button type="button" className="linkish" onClick={handleAddProperty}>
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
                    if (stockLocations.length === 0) setShowLocationModal(true);
                    else setShowLinkModal(true);
                  }}
                >
                  {stockLocations.length === 0 ? "Add stock location…" : "Link…"}
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
      )}

      <section className="panel">
        <div className="property-tabs">
          <button
            type="button"
            className={`property-tab ${activePropertyTab === "all" ? "active" : ""}`}
            onClick={() => setActivePropertyTab("all")}
          >
            All properties
            <span className="tab-count">({filteredPropertyStocks.length})</span>
          </button>
          {visibleProperties.map((property) => {
            const stockCount = propertyStocks.filter((s) => s.propertyId === property.id).length;
            return (
              <button
                key={property.id}
                type="button"
                className={`property-tab ${activePropertyTab === property.id ? "active" : ""}`}
                onClick={() => setActivePropertyTab(property.id)}
              >
                {property.name}
                <span className="tab-count">({stockCount})</span>
              </button>
            );
          })}
        </div>

        {activePropertyTab && activePropertyTab !== "all" && activePropertyTab !== "unassigned" && (
          <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const p = getPropertyById(activePropertyTab);
                if (p) handleEditProperty(p);
              }}
            >
              Edit property
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => handleDeleteProperty(activePropertyTab)}
            >
              Delete property
            </button>
          </div>
        )}

        <h3 style={{ marginTop: 0 }}>Property stock</h3>
        {filteredPropertyStocks.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>
            Replenish from a stock location to deploy items here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Supply item</th>
                  <th>Qty (base)</th>
                </tr>
              </thead>
              <tbody>
                {filteredPropertyStocks.map((row) => (
                  <tr key={row.id}>
                    <td>{row.property?.name || "—"}</td>
                    <td>{row.supplyItem?.name || "—"}</td>
                    <td>{Number(row.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 style={{ marginTop: "20px" }}>Recent moves</h3>
        {recentReplenishments.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No replenishments or returns yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px" }}>
            {recentReplenishments.slice(0, 8).map((r) => (
              <li key={r.id}>
                <strong>{r.direction}</strong> · {r.property?.name || "Property"} ←{" "}
                {r.stockLocation?.name || "Location"} · {(r.lines || []).length} line(s) ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}

        <details
          className="legacy-items-details"
          open={legacyOpen}
          onToggle={(e) => setLegacyOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>Legacy items (deprecated)</summary>
          <p style={{ fontSize: "13px", color: "#64748b", marginTop: 0 }}>
            Bill-back uses Replenish / Return. This table is the old per-property item list and will be retired later.
          </p>
          <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="secondary" onClick={handleAddItem}>
              Add legacy item
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
            >
              Categories
            </button>
            <button type="button" className="secondary" onClick={() => exportToCsv()}>
              Export CSV
            </button>
          </div>
          <SummaryBar items={items} filteredItems={filteredItems} />
          <InventoryTable
            items={filteredItems}
            properties={visibleProperties}
            onEdit={handleEdit}
            onDelete={removeItem}
            onAddQuantity={(item) => setAddQuantityItem(item)}
            onSubtract={(item) => setSubtractItem(item)}
          />
        </details>
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
          onClose={() => setShowReplenishModal(false)}
          onSuccess={() => {
            refreshStockFlows();
            refreshInventory();
          }}
        />
      )}

      {showReturnModal && (
        <ReturnStockModal
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            refreshStockFlows();
            refreshInventory();
          }}
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
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Manage Categories</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <h4 style={{ marginBottom: "12px" }}>{editingCategory ? "Edit Category" : "Add New Category"}</h4>
              <CategoryForm
                key={editingCategory ? editingCategory.id : "new"}
                initialValues={editingCategory ?? undefined}
                onSubmit={(values) => {
                  handleCategorySubmit(values);
                  setEditingCategory(null);
                }}
                onCancel={editingCategory ? handleCancelCategoryEdit : undefined}
              />
            </div>

            {(categories.length > 0 || allCategories.length > 0) && (
              <div style={{ marginTop: "32px", borderTop: "1px solid rgba(148, 163, 184, 0.3)", paddingTop: "20px" }}>
                <h4 style={{ marginBottom: "12px" }}>All Categories</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                  {allCategories.map((categoryName) => {
                    const itemsInCategory = items.filter((item) => item.category === categoryName);
                    const managedCategory = categories.find((c) => c.name === categoryName);
                    const isManaged = !!managedCategory;

                    return (
                      <div
                        key={categoryName}
                        style={{
                          border: "1px solid #ddd",
                          padding: "12px",
                          borderRadius: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
                            {categoryName}
                            {isManaged && (
                              <span style={{ fontSize: "0.7em", color: "#2563eb", fontWeight: "normal" }}>(Managed)</span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.85em", color: "#666" }}>
                            {itemsInCategory.length} item{itemsInCategory.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleEditCategory(categoryName, managedCategory?.id)}
                            aria-label="Edit category"
                            style={{ marginRight: "8px" }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => handleDeleteCategory(categoryName, managedCategory?.id)}
                            aria-label="Delete category"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


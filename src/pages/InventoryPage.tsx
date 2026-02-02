import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  InventoryItem,
  InventoryItemFormValues,
  Property,
  PropertyFormValues,
  Category,
  CategoryFormValues,
  Client
} from "../types";
import { useInventory } from "../hooks/useInventory";
import { useProperties } from "../hooks/useProperties";
import { useCategories } from "../hooks/useCategories";
import { InventoryForm } from "../components/InventoryForm";
import { PropertyForm } from "../components/PropertyForm";
import { CategoryForm } from "../components/CategoryForm";
import { InventoryTable } from "../components/InventoryTable";
import { SummaryBar } from "../components/SummaryBar";
import { TransferModal } from "../components/TransferModal";
import { SubtractItemModal } from "../components/SubtractItemModal";
import { AddQuantityModal } from "../components/AddQuantityModal";
import { BillToClientModal } from "../components/BillToClientModal";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";
import { clientsApi } from "../services/clientsApi";
import { invoicesApi } from "../services/invoicesApi";

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
    transfer,
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
    getPropertyById
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
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [subtractItem, setSubtractItem] = useState<InventoryItem | null>(null);
  const [addQuantityItem, setAddQuantityItem] = useState<InventoryItem | null>(null);
  const [billToClientItem, setBillToClientItem] = useState<InventoryItem | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
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

  // Load clients when subtract or add-quantity modal opens (add modal can bill to client)
  useEffect(() => {
    if (!subtractItem && !addQuantityItem) return;
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
  }, [subtractItem, addQuantityItem]);

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

  const createInvoiceForItem = async (item: InventoryItem, quantity: number, clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) throw new Error("Client not found");
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36)}`;
    const date = new Date().toISOString().split("T")[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const lineTotal = quantity * item.finalPrice;
    const subtotal = lineTotal;
    const tax = 0;
    const total = subtotal + tax;
    const invoiceItem = {
      id: crypto.randomUUID(),
      name: item.name,
      quantity,
      unitPrice: item.finalPrice,
      total: lineTotal,
      inventoryItemId: item.id,
      sku: item.sku,
    };
    await invoicesApi.create({
      invoiceNumber,
      clientId,
      clientName: client.name,
      date,
      dueDate,
      items: [invoiceItem],
      subtotal,
      tax,
      total,
      status: "draft",
    });
    window.dispatchEvent(new CustomEvent("invoices-refresh"));
  };

  const handleSubtractSubmit = async (
    item: InventoryItem,
    quantity: number,
    billToClient: boolean,
    clientId: string | null
  ) => {
    if (billToClient && clientId) {
      await createInvoiceForItem(item, quantity, clientId);
      await refreshInventory();
    } else {
      await updateItem(item.id, {
        ...item,
        quantity: Math.max(0, item.quantity - quantity),
      });
    }
  };

  const handleAddQuantitySubmit = async (
    item: InventoryItem,
    quantity: number,
    billToClient?: { clientId: string; quantityToBill: number }
  ) => {
    await updateItem(item.id, {
      ...item,
      quantity: item.quantity + quantity,
    });
    if (billToClient) {
      await createInvoiceForItem(item, billToClient.quantityToBill, billToClient.clientId);
    }
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
      <h2>Inventory Management</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <button
          type="button"
          className="add-property-button"
          onClick={handleAddProperty}
        >
          Add property
        </button>
        <button
          type="button"
          className="add-property-button"
          onClick={handleAddItem}
        >
          Add new item
        </button>
        {visibleProperties.length >= 2 && (
          <button
            type="button"
            className="add-property-button"
            onClick={() => setShowTransferModal(true)}
          >
            Transfer
          </button>
        )}
        <button
          type="button"
          className="add-property-button"
          onClick={() => {
            setEditingCategory(null);
            setShowCategoryModal(true);
          }}
        >
          Manage Categories
        </button>
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
              onSubmit={handlePropertySubmit}
              onCancel={handleCancelPropertyEdit}
            />
          </div>
        </div>
      )}

      <section className="panel">

        {visibleProperties.length > 0 ? (
          <>
            <div className="property-tabs">
              <button
                type="button"
                className={`property-tab ${activePropertyTab === "all" ? "active" : ""}`}
                onClick={() => setActivePropertyTab("all")}
              >
                All Products
                <span className="tab-count">({items.length})</span>
              </button>
              {visibleProperties.map((property) => {
                const itemsInProperty = items.filter((item) => item.propertyId === property.id);
                return (
                  <button
                    key={property.id}
                    type="button"
                    className={`property-tab ${activePropertyTab === property.id ? "active" : ""}`}
                    onClick={() => setActivePropertyTab(property.id)}
                  >
                    {property.name}
                    <span className="tab-count">({itemsInProperty.length})</span>
                  </button>
                );
              })}
              {items.some((item) => !item.propertyId) && (
                <button
                  type="button"
                  className={`property-tab ${activePropertyTab === "unassigned" ? "active" : ""}`}
                  onClick={() => setActivePropertyTab("unassigned")}
                >
                  Unassigned
                  <span className="tab-count">({items.filter((item) => !item.propertyId).length})</span>
                </button>
              )}
            </div>

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => exportToCsv()}
              >
                Export all inventory
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <label htmlFor="export-property-select" style={{ fontSize: "13px", color: "#64748b" }}>
                  Export by property:
                </label>
                <select
                  id="export-property-select"
                  className="export-property-select"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (!v) return;
                    if (v === "all") {
                      exportToCsv();
                      return;
                    }
                    const subset =
                      v === "unassigned"
                        ? items.filter((i) => !i.propertyId)
                        : items.filter((i) => i.propertyId === v);
                    const name =
                      v === "unassigned"
                        ? "Unassigned"
                        : visibleProperties.find((w) => w.id === v)?.name.replace(/[^a-zA-Z0-9]/g, "-") ?? v;
                    exportToCsvItems(subset, `inventory-${name}`);
                  }}
                >
                  <option value="">Choose property…</option>
                  <option value="all">All inventory</option>
                  {visibleProperties.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({items.filter((i) => i.propertyId === w.id).length})
                    </option>
                  ))}
                  {items.some((i) => !i.propertyId) && (
                    <option value="unassigned">
                      Unassigned ({items.filter((i) => !i.propertyId).length})
                    </option>
                  )}
                </select>
              </div>
              {activePropertyTab && activePropertyTab !== "all" && activePropertyTab !== "unassigned" && (
                <button
                  type="button"
                  className="add-property-button"
                  onClick={() => {
                    if (activePropertyTab) {
                      handleDeleteProperty(activePropertyTab);
                    }
                  }}
                >
                  Delete property
                </button>
              )}
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
          </>
        ) : (
          <>
            <div className="property-tabs">
              <button
                type="button"
                className={`property-tab ${activePropertyTab === "all" ? "active" : ""}`}
                onClick={() => setActivePropertyTab("all")}
              >
                All Products
                <span className="tab-count">({items.length})</span>
              </button>
            </div>

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => exportToCsv()}
              >
                Export all inventory
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <label htmlFor="export-property-select-single" style={{ fontSize: "13px", color: "#64748b" }}>
                  Export by property:
                </label>
                <select
                  id="export-property-select-single"
                  className="export-property-select"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (!v) return;
                    if (v === "all") {
                      exportToCsv();
                      return;
                    }
                    const subset =
                      v === "unassigned"
                        ? items.filter((i) => !i.propertyId)
                        : items.filter((i) => i.propertyId === v);
                    const name =
                      v === "unassigned"
                        ? "Unassigned"
                        : visibleProperties.find((w) => w.id === v)?.name.replace(/[^a-zA-Z0-9]/g, "-") ?? v;
                    exportToCsvItems(subset, `inventory-${name}`);
                  }}
                >
                  <option value="">Choose property…</option>
                  <option value="all">All inventory</option>
                  {visibleProperties.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({items.filter((i) => i.propertyId === w.id).length})
                    </option>
                  ))}
                  {items.some((i) => !i.propertyId) && (
                    <option value="unassigned">
                      Unassigned ({items.filter((i) => !i.propertyId).length})
                    </option>
                  )}
                </select>
              </div>
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
          </>
        )}
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

      {showTransferModal && (
        <TransferModal
          items={items}
          properties={visibleProperties}
          onSubmit={transfer}
          onClose={() => setShowTransferModal(false)}
        />
      )}

      {subtractItem && (
        <SubtractItemModal
          item={subtractItem}
          clients={clients}
          onClose={() => setSubtractItem(null)}
          onSubmit={async (quantity, billToClient, clientId) => {
            await handleSubtractSubmit(subtractItem, quantity, billToClient, clientId);
          }}
        />
      )}

      {addQuantityItem && (
        <AddQuantityModal
          item={addQuantityItem}
          clients={clients}
          onClose={() => setAddQuantityItem(null)}
          onSubmit={async (quantity, billToClient) => {
            await handleAddQuantitySubmit(addQuantityItem, quantity, billToClient);
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
};

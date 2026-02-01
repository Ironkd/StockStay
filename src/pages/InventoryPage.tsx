import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  InventoryItem,
  InventoryItemFormValues,
  Warehouse,
  WarehouseFormValues,
  Category,
  CategoryFormValues,
  Client
} from "../types";
import { useInventory } from "../hooks/useInventory";
import { useWarehouses } from "../hooks/useWarehouses";
import { useCategories } from "../hooks/useCategories";
import { InventoryForm } from "../components/InventoryForm";
import { WarehouseForm } from "../components/WarehouseForm";
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
  const [maxWarehouses, setMaxWarehouses] = useState<number>(1);
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
    exportToJson,
    exportToJsonItems
  } = useInventory();

  const {
    warehouses,
    addWarehouse,
    updateWarehouse,
    removeWarehouse,
    getWarehouseById
  } = useWarehouses();

  const {
    categories,
    addCategory,
    updateCategory,
    removeCategory
  } = useCategories();

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [subtractItem, setSubtractItem] = useState<InventoryItem | null>(null);
  const [addQuantityItem, setAddQuantityItem] = useState<InventoryItem | null>(null);
  const [billToClientItem, setBillToClientItem] = useState<InventoryItem | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [activeWarehouseTab, setActiveWarehouseTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Load team warehouse limit (Pro trial = 10, Starter = 3, free = 1). Use /team/limits so we don't need settings access.
  useEffect(() => {
    let cancelled = false;
    teamApi.getTeamLimits().then((data) => {
      if (!cancelled && data.effectiveMaxWarehouses != null) {
        setMaxWarehouses(data.effectiveMaxWarehouses);
        setTeamLimitsLoaded(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load clients when subtract or bill-to-client modal opens
  useEffect(() => {
    if (!subtractItem && !billToClientItem) return;
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
  }, [subtractItem, billToClientItem]);

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

  // Apply warehouse visibility restrictions: invited members see only warehouses the owner picked (empty = all)
  const visibleWarehouses = useMemo(() => {
    if (!user) return warehouses;
    if (user.teamRole === "owner") return warehouses;
    if (!user.allowedWarehouseIds || user.allowedWarehouseIds.length === 0) {
      return warehouses;
    }
    return warehouses.filter((w) => user.allowedWarehouseIds!.includes(w.id));
  }, [user, warehouses]);

  // Set default active tab to "all" to show all products
  useEffect(() => {
    if (activeWarehouseTab === null) {
      setActiveWarehouseTab("all");
    } else if (
      activeWarehouseTab !== "all" &&
      activeWarehouseTab !== "unassigned" &&
      visibleWarehouses.length > 0 &&
      !visibleWarehouses.find((w) => w.id === activeWarehouseTab)
    ) {
      // If the active warehouse was deleted, switch to "all"
      setActiveWarehouseTab("all");
    }
  }, [warehouses, activeWarehouseTab]);

  const filteredItems = useMemo(() => {
    // Members: only filter by warehouse when owner explicitly picked some; empty = see all
    const allowedWarehouseIds =
      user && user.teamRole !== "owner" && user.allowedWarehouseIds && user.allowedWarehouseIds.length > 0
        ? new Set(user.allowedWarehouseIds)
        : null;

    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      // Enforce warehouse-level visibility: members only see items in allowed warehouses (when restricted)
      if (allowedWarehouseIds !== null) {
        if (!item.warehouseId || !allowedWarehouseIds.has(item.warehouseId)) return false;
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
      const matchesWarehouse =
        activeWarehouseTab === "all" || activeWarehouseTab === null
          ? true
          : activeWarehouseTab === "unassigned"
          ? !item.warehouseId
          : item.warehouseId === activeWarehouseTab;
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
        matchesWarehouse &&
        matchesStatus
      );
    });
  }, [
    items,
    search,
    categoryFilter,
    locationFilter,
    activeWarehouseTab,
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

  const handleWarehouseSubmit = async (values: WarehouseFormValues) => {
    try {
      if (editingWarehouse) {
        await updateWarehouse(editingWarehouse.id, values);
        setEditingWarehouse(null);
      } else {
        await addWarehouse(values);
      }
      setShowWarehouseModal(false);
    } catch {
      // Error already set in useWarehouses; keep modal open
    }
  };

  const handleEditWarehouse = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setShowWarehouseModal(true);
  };

  const handleCancelWarehouseEdit = () => {
    setEditingWarehouse(null);
    setShowWarehouseModal(false);
  };

  const handleAddWarehouse = () => {
    // Only block when we've loaded limits from the server (Pro trial = 10, so we don't block at 1 incorrectly)
    if (teamLimitsLoaded && warehouses.length >= maxWarehouses) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingWarehouse(null);
    setShowWarehouseModal(true);
  };

  const handleDeleteWarehouse = async (id: string) => {
    const warehouse = warehouses.find((w) => w.id === id);
    if (!warehouse) return;
    
    const itemsInWarehouse = items.filter((item) => item.warehouseId === id);
    const itemCount = itemsInWarehouse.length;
    
    let message = `Are you sure you want to delete the warehouse "${warehouse.name}"?`;
    if (itemCount > 0) {
      message += `\n\n⚠️ WARNING: This warehouse has ${itemCount} item(s) assigned to it. Deleting this warehouse will remove the warehouse assignment from these items.`;
    }
    message += "\n\nThis action cannot be undone.";
    
    if (!window.confirm(message)) {
      return;
    }
    
    try {
      await removeWarehouse(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete warehouse");
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
    } else {
      await updateItem(item.id, {
        ...item,
        quantity: Math.max(0, item.quantity - quantity),
      });
    }
  };

  const handleAddQuantitySubmit = async (item: InventoryItem, quantity: number) => {
    await updateItem(item.id, {
      ...item,
      quantity: item.quantity + quantity,
    });
  };

  const handleBillToClientSubmit = async (item: InventoryItem, quantity: number, clientId: string) => {
    await createInvoiceForItem(item, quantity, clientId);
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
          className="add-warehouse-button"
          onClick={handleAddWarehouse}
        >
          Add property
        </button>
        <button
          type="button"
          className="add-warehouse-button"
          onClick={handleAddItem}
        >
          Add new item
        </button>
        {visibleWarehouses.length >= 2 && (
          <button
            type="button"
            className="add-warehouse-button"
            onClick={() => setShowTransferModal(true)}
          >
            Transfer
          </button>
        )}
        <button
          type="button"
          className="add-warehouse-button"
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
              <h3>Warehouse limit reached</h3>
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
              You can&apos;t add more warehouses on your current plan (limit: {maxWarehouses}). Click below to upgrade your plan and get more warehouses.
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

      {showWarehouseModal && (
        <div className="modal-overlay" onClick={handleCancelWarehouseEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>{editingWarehouse ? "Edit Property" : "Add property"}</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={handleCancelWarehouseEdit}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <WarehouseForm
              key={editingWarehouse ? editingWarehouse.id : "new"}
              initialValues={editingWarehouse ?? undefined}
              onSubmit={handleWarehouseSubmit}
              onCancel={handleCancelWarehouseEdit}
            />
          </div>
        </div>
      )}

      <section className="panel">

        {visibleWarehouses.length > 0 ? (
          <>
            <div className="warehouse-tabs">
              <button
                type="button"
                className={`warehouse-tab ${activeWarehouseTab === "all" ? "active" : ""}`}
                onClick={() => setActiveWarehouseTab("all")}
              >
                All Products
                <span className="tab-count">({items.length})</span>
              </button>
              {visibleWarehouses.map((warehouse) => {
                const itemsInWarehouse = items.filter((item) => item.warehouseId === warehouse.id);
                return (
                  <button
                    key={warehouse.id}
                    type="button"
                    className={`warehouse-tab ${activeWarehouseTab === warehouse.id ? "active" : ""}`}
                    onClick={() => setActiveWarehouseTab(warehouse.id)}
                  >
                    {warehouse.name}
                    <span className="tab-count">({itemsInWarehouse.length})</span>
                  </button>
                );
              })}
              {items.some((item) => !item.warehouseId) && (
                <button
                  type="button"
                  className={`warehouse-tab ${activeWarehouseTab === "unassigned" ? "active" : ""}`}
                  onClick={() => setActiveWarehouseTab("unassigned")}
                >
                  Unassigned
                  <span className="tab-count">({items.filter((item) => !item.warehouseId).length})</span>
                </button>
              )}
            </div>

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => exportToJson()}
              >
                Export all inventory
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <label htmlFor="export-warehouse-select" style={{ fontSize: "13px", color: "#64748b" }}>
                  Export by warehouse:
                </label>
                <select
                  id="export-warehouse-select"
                  className="export-warehouse-select"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (!v) return;
                    if (v === "all") {
                      exportToJson();
                      return;
                    }
                    const subset =
                      v === "unassigned"
                        ? items.filter((i) => !i.warehouseId)
                        : items.filter((i) => i.warehouseId === v);
                    const name =
                      v === "unassigned"
                        ? "Unassigned"
                        : visibleWarehouses.find((w) => w.id === v)?.name.replace(/[^a-zA-Z0-9]/g, "-") ?? v;
                    exportToJsonItems(subset, `inventory-${name}`);
                  }}
                >
                  <option value="">Choose warehouse…</option>
                  <option value="all">All inventory</option>
                  {visibleWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({items.filter((i) => i.warehouseId === w.id).length})
                    </option>
                  ))}
                  {items.some((i) => !i.warehouseId) && (
                    <option value="unassigned">
                      Unassigned ({items.filter((i) => !i.warehouseId).length})
                    </option>
                  )}
                </select>
              </div>
              {activeWarehouseTab && activeWarehouseTab !== "all" && activeWarehouseTab !== "unassigned" && (
                <button
                  type="button"
                  className="add-warehouse-button"
                  onClick={() => {
                    if (activeWarehouseTab) {
                      handleDeleteWarehouse(activeWarehouseTab);
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
              warehouses={visibleWarehouses}
              onEdit={handleEdit}
              onDelete={removeItem}
              onAddQuantity={(item) => setAddQuantityItem(item)}
              onSubtract={(item) => setSubtractItem(item)}
              onBillToClient={(item) => setBillToClientItem(item)}
            />
          </>
        ) : (
          <>
            <div className="warehouse-tabs">
              <button
                type="button"
                className={`warehouse-tab ${activeWarehouseTab === "all" ? "active" : ""}`}
                onClick={() => setActiveWarehouseTab("all")}
              >
                All Products
                <span className="tab-count">({items.length})</span>
              </button>
            </div>

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => exportToJson()}
              >
                Export all inventory
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <label htmlFor="export-warehouse-select-single" style={{ fontSize: "13px", color: "#64748b" }}>
                  Export by warehouse:
                </label>
                <select
                  id="export-warehouse-select-single"
                  className="export-warehouse-select"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (!v) return;
                    if (v === "all") {
                      exportToJson();
                      return;
                    }
                    const subset =
                      v === "unassigned"
                        ? items.filter((i) => !i.warehouseId)
                        : items.filter((i) => i.warehouseId === v);
                    const name =
                      v === "unassigned"
                        ? "Unassigned"
                        : visibleWarehouses.find((w) => w.id === v)?.name.replace(/[^a-zA-Z0-9]/g, "-") ?? v;
                    exportToJsonItems(subset, `inventory-${name}`);
                  }}
                >
                  <option value="">Choose warehouse…</option>
                  <option value="all">All inventory</option>
                  {visibleWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({items.filter((i) => i.warehouseId === w.id).length})
                    </option>
                  ))}
                  {items.some((i) => !i.warehouseId) && (
                    <option value="unassigned">
                      Unassigned ({items.filter((i) => !i.warehouseId).length})
                    </option>
                  )}
                </select>
              </div>
            </div>

            <SummaryBar items={items} filteredItems={filteredItems} />

            <InventoryTable
              items={filteredItems}
              warehouses={visibleWarehouses}
              onEdit={handleEdit}
              onDelete={removeItem}
              onAddQuantity={(item) => setAddQuantityItem(item)}
              onSubtract={(item) => setSubtractItem(item)}
              onBillToClient={(item) => setBillToClientItem(item)}
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
              warehouses={visibleWarehouses}
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
          warehouses={visibleWarehouses}
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
          onClose={() => setAddQuantityItem(null)}
          onSubmit={async (quantity) => {
            await handleAddQuantitySubmit(addQuantityItem, quantity);
          }}
        />
      )}

      {billToClientItem && (
        <BillToClientModal
          item={billToClientItem}
          clients={clients}
          onClose={() => setBillToClientItem(null)}
          onSubmit={async (quantity, clientId) => {
            await handleBillToClientSubmit(billToClientItem, quantity, clientId);
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

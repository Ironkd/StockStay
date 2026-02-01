import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  InventoryItem,
  InventoryItemFormValues,
  Warehouse,
  WarehouseFormValues,
  Category,
  CategoryFormValues
} from "../types";
import { useInventory } from "../hooks/useInventory";
import { useWarehouses } from "../hooks/useWarehouses";
import { useCategories } from "../hooks/useCategories";
import { InventoryForm } from "../components/InventoryForm";
import { WarehouseForm } from "../components/WarehouseForm";
import { CategoryForm } from "../components/CategoryForm";
import { InventoryTable } from "../components/InventoryTable";
import { SummaryBar } from "../components/SummaryBar";
import { FilterModal } from "../components/FilterModal";
import { TransferModal } from "../components/TransferModal";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";

export const InventoryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [maxWarehouses, setMaxWarehouses] = useState<number>(1);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const {
    items,
    addItem,
    updateItem,
    removeItem,
    clearAll,
    transfer,
    importFromJson,
    exportToJson
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
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [activeWarehouseTab, setActiveWarehouseTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Load team to get effective warehouse limit (Pro trial = 10, Starter = 3, free = 1)
  useEffect(() => {
    let cancelled = false;
    teamApi.getTeam().then((data) => {
      if (!cancelled && data.team.effectiveMaxWarehouses != null) {
        setMaxWarehouses(data.team.effectiveMaxWarehouses);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  // Apply warehouse visibility restrictions based on the current user
  const visibleWarehouses = useMemo(() => {
    if (!user || !user.allowedWarehouseIds || user.allowedWarehouseIds.length === 0) {
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
    const allowedWarehouseIds =
      user && user.allowedWarehouseIds && user.allowedWarehouseIds.length > 0
        ? new Set(user.allowedWarehouseIds)
        : null;

    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      // Enforce warehouse-level visibility on the client as well
      if (
        allowedWarehouseIds &&
        (!item.warehouseId || !allowedWarehouseIds.has(item.warehouseId))
      ) {
        return false;
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

  const handleWarehouseSubmit = (values: WarehouseFormValues) => {
    if (editingWarehouse) {
      updateWarehouse(editingWarehouse.id, values);
      setEditingWarehouse(null);
    } else {
      addWarehouse(values);
    }
    setShowWarehouseModal(false);
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
    if (warehouses.length >= maxWarehouses) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingWarehouse(null);
    setShowWarehouseModal(true);
  };

  const handleDeleteWarehouse = (id: string) => {
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
    
    removeWarehouse(id);
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
          Add Warehouse
        </button>
        <button
          type="button"
          className="add-warehouse-button"
          onClick={handleAddItem}
        >
          Add Item
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
              <h3>{editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}</h3>
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

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowFilterModal(true)}
              >
                🔍 Filter
              </button>
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
                  Delete Warehouse
                </button>
              )}
            </div>

            <SummaryBar items={items} filteredItems={filteredItems} />

            <InventoryTable
              items={filteredItems}
              warehouses={visibleWarehouses}
              onEdit={handleEdit}
              onDelete={removeItem}
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

            <div style={{ marginBottom: "16px" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowFilterModal(true)}
              >
                🔍 Filter
              </button>
            </div>

            <SummaryBar items={items} filteredItems={filteredItems} />

            <InventoryTable
              items={filteredItems}
              warehouses={visibleWarehouses}
              onEdit={handleEdit}
              onDelete={removeItem}
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

      {showFilterModal && (
        <FilterModal
          search={search}
          onSearchChange={setSearch}
          categories={allCategories}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          locations={locations}
          locationFilter={locationFilter}
          onLocationFilterChange={setLocationFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          onImport={importFromJson}
          onExport={exportToJson}
          onClose={() => setShowFilterModal(false)}
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

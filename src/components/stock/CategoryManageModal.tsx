import React from "react";
import type { Category, CategoryFormValues, InventoryItem } from "../../types";
import { CategoryForm } from "../CategoryForm";

type Props = {
  editingCategory: Category | null;
  categories: Category[];
  allCategories: string[];
  items: InventoryItem[];
  onClose: () => void;
  onCategorySubmit: (values: CategoryFormValues | CategoryFormValues[]) => void;
  onCancelCategoryEdit: () => void;
  onEditCategory: (categoryName: string, categoryId?: string) => void;
  onDeleteCategory: (categoryName: string, categoryId?: string) => void;
  onEditingCategoryClear: () => void;
};

export const CategoryManageModal: React.FC<Props> = ({
  editingCategory,
  categories,
  allCategories,
  items,
  onClose,
  onCategorySubmit,
  onCancelCategoryEdit,
  onEditCategory,
  onDeleteCategory,
  onEditingCategoryClear,
}) => (
  <div className="modal-overlay" onClick={onClose}>
    <div
      className="modal-content"
      onClick={(e) => e.stopPropagation()}
      style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h3>Manage Categories</h3>
        <button
          type="button"
          className="icon-button close-button"
          onClick={() => {
            onClose();
            onEditingCategoryClear();
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h4 style={{ marginBottom: "12px" }}>
          {editingCategory ? "Edit Category" : "Add New Category"}
        </h4>
        <CategoryForm
          key={editingCategory ? editingCategory.id : "new"}
          initialValues={editingCategory ?? undefined}
          onSubmit={(values) => {
            onCategorySubmit(values);
            onEditingCategoryClear();
          }}
          onCancel={editingCategory ? onCancelCategoryEdit : undefined}
        />
      </div>

      {(categories.length > 0 || allCategories.length > 0) && (
        <div
          style={{
            marginTop: "32px",
            borderTop: "1px solid rgba(148, 163, 184, 0.3)",
            paddingTop: "20px",
          }}
        >
          <h4 style={{ marginBottom: "12px" }}>All Categories</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
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
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {categoryName}
                      {isManaged && (
                        <span style={{ fontSize: "0.7em", color: "#2563eb", fontWeight: "normal" }}>
                          (Managed)
                        </span>
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
                      onClick={() => onEditCategory(categoryName, managedCategory?.id)}
                      aria-label="Edit category"
                      style={{ marginRight: "8px" }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => onDeleteCategory(categoryName, managedCategory?.id)}
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
);

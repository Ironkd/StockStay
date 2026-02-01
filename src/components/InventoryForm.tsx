import React, { useState, useEffect } from "react";
import { InventoryItem, InventoryItemFormValues, Warehouse } from "../types";

type Props = {
  initialValues?: InventoryItem;
  warehouses?: Warehouse[];
  categories?: string[];
  onSubmit: (values: InventoryItemFormValues | InventoryItemFormValues[]) => void;
  onCancel?: () => void;
};

const defaultValues: InventoryItemFormValues = {
  name: "",
  sku: "",
  category: "",
  location: "",
  warehouseId: undefined,
  quantity: 0,
  unit: "pcs",
  reorderPoint: 0,
  priceBoughtFor: 0,
  markupPercentage: 0,
  finalPrice: 0,
  tags: [],
  notes: ""
};

export const InventoryForm: React.FC<Props> = ({
  initialValues,
  warehouses = [],
  categories = [],
  onSubmit,
  onCancel
}) => {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<InventoryItemFormValues[]>([]);
  const [values, setValues] = useState<InventoryItemFormValues>(
    initialValues
      ? {
          name: initialValues.name,
          sku: initialValues.sku,
          category: initialValues.category,
          location: initialValues.location,
          warehouseId: initialValues.warehouseId,
          quantity: initialValues.quantity,
          unit: initialValues.unit,
          reorderPoint: initialValues.reorderPoint,
          priceBoughtFor: initialValues.priceBoughtFor,
          markupPercentage: initialValues.markupPercentage,
          finalPrice: initialValues.finalPrice,
          tags: initialValues.tags,
          notes: initialValues.notes
        }
      : defaultValues
  );

  // Calculate final price when priceBoughtFor or markupPercentage changes
  useEffect(() => {
    if (!initialValues && !isBulkMode) {
      const calculatedPrice = values.priceBoughtFor * (1 + values.markupPercentage / 100);
      setValues((prev) => ({ ...prev, finalPrice: Number(calculatedPrice.toFixed(2)) }));
    }
  }, [values.priceBoughtFor, values.markupPercentage, initialValues, isBulkMode]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    if (name === "quantity" || name === "reorderPoint" || name === "priceBoughtFor" || name === "markupPercentage" || name === "finalPrice") {
      const numeric = Number(value);
      setValues((prev) => {
        const updated = { ...prev, [name]: Number.isNaN(numeric) ? 0 : numeric };
        // Recalculate final price if priceBoughtFor or markupPercentage changed
        if ((name === "priceBoughtFor" || name === "markupPercentage") && !initialValues) {
          const calculatedPrice = (name === "priceBoughtFor" ? numeric : updated.priceBoughtFor) * 
                                  (1 + (name === "markupPercentage" ? numeric : updated.markupPercentage) / 100);
          updated.finalPrice = Number(calculatedPrice.toFixed(2));
        }
        return updated;
      });
    } else if (name === "tags") {
      const tags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      setValues((prev) => ({ ...prev, tags }));
    } else if (name === "warehouseId") {
      setValues((prev) => ({ ...prev, warehouseId: value || undefined }));
    } else {
      setValues((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleBulkItemChange = (index: number, field: keyof InventoryItemFormValues, value: any) => {
    setBulkItems((prev) => {
      const updated = [...prev];
      if (!updated[index]) {
        updated[index] = { ...defaultValues };
      }
      updated[index] = { ...updated[index], [field]: value };
      // Calculate final price for bulk items
      if (field === "priceBoughtFor" || field === "markupPercentage") {
        const item = updated[index];
        const calculatedPrice = item.priceBoughtFor * (1 + item.markupPercentage / 100);
        updated[index].finalPrice = Number(calculatedPrice.toFixed(2));
      }
      return updated;
    });
  };

  const addBulkItem = () => {
    setBulkItems((prev) => [...prev, { ...defaultValues }]);
  };

  const removeBulkItem = (index: number) => {
    setBulkItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBulkMode) {
      // Validate bulk items
      const validItems = bulkItems.filter(item => item.name.trim());
      if (validItems.length === 0) {
        alert("Please add at least one valid item with a name.");
        return;
      }
      onSubmit(validItems.map(item => ({
        ...item,
        name: item.name.trim()
      })));
      setBulkItems([]);
      return;
    }

    // Single item mode
    if (!values.name.trim()) {
      alert("Name is required.");
      return;
    }
    onSubmit({
      ...values,
      name: values.name.trim()
    });
    if (!initialValues) {
      setValues(defaultValues);
    }
  };

  if (isBulkMode && !initialValues) {
    return (
      <form className="inventory-form" onSubmit={handleSubmit}>
        <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Bulk Inventory Entry</h4>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setIsBulkMode(false);
              setBulkItems([]);
            }}
          >
            Switch to Single Item
          </button>
        </div>

        {bulkItems.map((item, index) => (
          <div key={index} style={{ border: "1px solid #ddd", padding: "16px", marginBottom: "16px", borderRadius: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h5>Item {index + 1}</h5>
              <button
                type="button"
                className="secondary"
                onClick={() => removeBulkItem(index)}
              >
                Remove
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Name *</span>
                <input
                  value={item.name}
                  onChange={(e) => handleBulkItemChange(index, "name", e.target.value)}
                  placeholder="e.g. USB-C cable"
                  required
                />
              </label>
              <label>
                <span>Warehouse</span>
                <select
                  value={item.warehouseId || ""}
                  onChange={(e) => handleBulkItemChange(index, "warehouseId", e.target.value || undefined)}
                >
                  <option value="">None</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Category</span>
                <select
                  value={item.category}
                  onChange={(e) => handleBulkItemChange(index, "category", e.target.value)}
                >
                  <option value="">None</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Quantity</span>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleBulkItemChange(index, "quantity", Number(e.target.value) || 0)}
                  min={0}
                />
              </label>
              <label>
                <span>Price Bought For</span>
                <input
                  type="number"
                  step="0.01"
                  value={item.priceBoughtFor}
                  onChange={(e) => handleBulkItemChange(index, "priceBoughtFor", Number(e.target.value) || 0)}
                  min={0}
                />
              </label>
              <label>
                <span>Markup %</span>
                <input
                  type="number"
                  step="0.01"
                  value={item.markupPercentage}
                  onChange={(e) => handleBulkItemChange(index, "markupPercentage", Number(e.target.value) || 0)}
                  min={0}
                />
              </label>
              <label>
                <span>Final Price</span>
                <input
                  type="number"
                  step="0.01"
                  value={item.finalPrice}
                  onChange={(e) => handleBulkItemChange(index, "finalPrice", Number(e.target.value) || 0)}
                  min={0}
                />
              </label>
            </div>
          </div>
        ))}

        <div style={{ marginBottom: "16px" }}>
          <button type="button" className="secondary" onClick={addBulkItem}>
            + Add Another Item
          </button>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setIsBulkMode(false);
              setBulkItems([]);
            }}
          >
            Cancel
          </button>
          <button type="submit">
            Add {bulkItems.length} Item{bulkItems.length !== 1 ? "s" : ""}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="inventory-form" onSubmit={handleSubmit}>
      {!initialValues && (
        <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Add Mode:</span>
          <button
            type="button"
            className={isBulkMode ? "secondary" : ""}
            onClick={() => {
              setIsBulkMode(true);
              if (bulkItems.length === 0) {
                addBulkItem();
              }
            }}
          >
            Bulk Entry
          </button>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>Name *</span>
          <input
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="e.g. USB-C cable"
            required
          />
        </label>

        <label>
          <span>Warehouse</span>
          <select
            name="warehouseId"
            value={values.warehouseId || ""}
            onChange={handleChange}
          >
            <option value="">None</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Category</span>
          <select
            name="category"
            value={values.category}
            onChange={handleChange}
          >
            <option value="">None</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Quantity</span>
          <input
            type="number"
            name="quantity"
            value={values.quantity}
            onChange={handleChange}
            min={0}
          />
        </label>

        <label>
          <span>Unit</span>
          <input
            name="unit"
            value={values.unit}
            onChange={handleChange}
            placeholder="e.g. pcs, boxes"
          />
        </label>

        <label>
          <span>Reorder point</span>
          <input
            type="number"
            name="reorderPoint"
            value={values.reorderPoint}
            onChange={handleChange}
            min={0}
          />
        </label>

        <label>
          <span>Price Bought For</span>
          <input
            type="number"
            step="0.01"
            name="priceBoughtFor"
            value={values.priceBoughtFor}
            onChange={handleChange}
            min={0}
          />
        </label>

        <label>
          <span>Markup Percentage</span>
          <input
            type="number"
            step="0.01"
            name="markupPercentage"
            value={values.markupPercentage}
            onChange={handleChange}
            min={0}
          />
        </label>

        <label>
          <span>Final Price</span>
          <input
            type="number"
            step="0.01"
            name="finalPrice"
            value={values.finalPrice}
            onChange={handleChange}
            min={0}
          />
        </label>

        <label>
          <span>Tags (comma separated)</span>
          <input
            name="tags"
            value={values.tags.join(", ")}
            onChange={handleChange}
            placeholder="e.g. critical, fragile"
          />
        </label>
      </div>

      <label className="notes-field">
        <span>Notes</span>
        <textarea
          name="notes"
          value={values.notes}
          onChange={handleChange}
          rows={3}
          placeholder="Any extra details about this item…"
        />
      </label>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit">
          {initialValues ? "Save changes" : "Add new item"}
        </button>
      </div>
    </form>
  );
};


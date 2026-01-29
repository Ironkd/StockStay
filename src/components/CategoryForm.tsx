import React, { useState, useEffect } from "react";
import { Category, CategoryFormValues } from "../types";

type Props = {
  initialValues?: Category;
  onSubmit: (values: CategoryFormValues | CategoryFormValues[]) => void;
  onCancel?: () => void;
};

const defaultValues: CategoryFormValues = {
  name: ""
};

export const CategoryForm: React.FC<Props> = ({
  initialValues,
  onSubmit,
  onCancel
}) => {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkCategories, setBulkCategories] = useState<CategoryFormValues[]>([]);
  const [values, setValues] = useState<CategoryFormValues>(
    initialValues
      ? {
          name: initialValues.name
        }
      : defaultValues
  );

  // Update form values when initialValues changes (for editing)
  useEffect(() => {
    if (initialValues) {
      setValues({
        name: initialValues.name
      });
      setIsBulkMode(false);
      setBulkCategories([]);
    } else {
      setValues(defaultValues);
    }
  }, [initialValues]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleBulkCategoryChange = (index: number, value: string) => {
    setBulkCategories((prev) => {
      const updated = [...prev];
      if (!updated[index]) {
        updated[index] = { ...defaultValues };
      }
      updated[index] = { ...updated[index], name: value };
      return updated;
    });
  };

  const addBulkCategory = () => {
    setBulkCategories((prev) => [...prev, { ...defaultValues }]);
  };

  const removeBulkCategory = (index: number) => {
    setBulkCategories((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBulkMode && !initialValues) {
      // Validate bulk categories
      const validCategories = bulkCategories
        .map(cat => cat.name.trim())
        .filter(name => name.length > 0);
      
      if (validCategories.length === 0) {
        alert("Please add at least one valid category name.");
        return;
      }
      
      // Remove duplicates
      const uniqueCategories = Array.from(new Set(validCategories));
      
      onSubmit(uniqueCategories.map(name => ({ name })));
      setBulkCategories([]);
      return;
    }

    // Single category mode
    if (!values.name.trim()) {
      alert("Category name is required.");
      return;
    }
    onSubmit({
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
          <h4>Bulk Category Entry</h4>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setIsBulkMode(false);
              setBulkCategories([]);
            }}
          >
            Switch to Single Category
          </button>
        </div>

        {bulkCategories.map((category, index) => (
          <div key={index} style={{ border: "1px solid #ddd", padding: "12px", marginBottom: "12px", borderRadius: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontWeight: "500" }}>Category {index + 1}</span>
              <button
                type="button"
                className="secondary"
                onClick={() => removeBulkCategory(index)}
              >
                Remove
              </button>
            </div>
            <label>
              <span>Category Name *</span>
              <input
                value={category.name}
                onChange={(e) => handleBulkCategoryChange(index, e.target.value)}
                placeholder="e.g. Electronics"
                required
              />
            </label>
          </div>
        ))}

        <div style={{ marginBottom: "16px" }}>
          <button type="button" className="secondary" onClick={addBulkCategory}>
            + Add Another Category
          </button>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setIsBulkMode(false);
              setBulkCategories([]);
            }}
          >
            Cancel
          </button>
          <button type="submit">
            Add {bulkCategories.length} Categor{bulkCategories.length !== 1 ? "ies" : "y"}
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
              if (bulkCategories.length === 0) {
                addBulkCategory();
              }
            }}
          >
            Bulk Entry
          </button>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>Category Name *</span>
          <input
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="e.g. Electronics, Clothing"
            required
          />
        </label>
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit">
          {initialValues ? "Save changes" : "Add category"}
        </button>
      </div>
    </form>
  );
};

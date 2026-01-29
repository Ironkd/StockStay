import React, { useState } from "react";
import { Warehouse, WarehouseFormValues } from "../types";

type Props = {
  initialValues?: Warehouse;
  onSubmit: (values: WarehouseFormValues) => void;
  onCancel?: () => void;
};

const defaultValues: WarehouseFormValues = {
  name: "",
  location: ""
};

export const WarehouseForm: React.FC<Props> = ({
  initialValues,
  onSubmit,
  onCancel
}) => {
  const [values, setValues] = useState<WarehouseFormValues>(
    initialValues
      ? {
          name: initialValues.name,
          location: initialValues.location
        }
      : defaultValues
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      alert("Warehouse name is required.");
      return;
    }
    if (!values.location.trim()) {
      alert("Warehouse location is required.");
      return;
    }
    onSubmit({
      name: values.name.trim(),
      location: values.location.trim()
    });
    if (!initialValues) {
      setValues(defaultValues);
    }
  };

  return (
    <form className="inventory-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          <span>Warehouse Name *</span>
          <input
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="e.g. Main Warehouse"
            required
          />
        </label>

        <label>
          <span>Location *</span>
          <input
            name="location"
            value={values.location}
            onChange={handleChange}
            placeholder="e.g. 123 Main St, City, State"
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
          {initialValues ? "Save changes" : "Add warehouse"}
        </button>
      </div>
    </form>
  );
};

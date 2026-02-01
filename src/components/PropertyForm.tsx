import React, { useState } from "react";
import { Property, PropertyFormValues } from "../types";

type Props = {
  initialValues?: Property;
  onSubmit: (values: PropertyFormValues) => void;
  onCancel?: () => void;
};

const defaultValues: PropertyFormValues = {
  name: "",
  location: ""
};

export const PropertyForm: React.FC<Props> = ({
  initialValues,
  onSubmit,
  onCancel
}) => {
  const [values, setValues] = useState<PropertyFormValues>(
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
      alert("Property name is required.");
      return;
    }
    if (!values.location.trim()) {
      alert("Property location is required.");
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
          <span>Property Name *</span>
          <input
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="e.g. Main Property"
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
          {initialValues ? "Save changes" : "Add property"}
        </button>
      </div>
    </form>
  );
};

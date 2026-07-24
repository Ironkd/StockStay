import React, { useState } from "react";
import { Client, Property, PropertyFormValues } from "../types";

type Props = {
  initialValues?: Property;
  clients?: Client[];
  onSubmit: (values: PropertyFormValues) => void;
  onCancel?: () => void;
};

const defaultValues: PropertyFormValues = {
  name: "",
  location: "",
  clientId: null,
  markupPercentage: null,
};

export const PropertyForm: React.FC<Props> = ({
  initialValues,
  clients = [],
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<PropertyFormValues>(
    initialValues
      ? {
          name: initialValues.name,
          location: initialValues.location,
          clientId: initialValues.clientId ?? null,
          markupPercentage:
            initialValues.markupPercentage != null ? String(initialValues.markupPercentage) : "",
        }
      : defaultValues
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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
    const markupRaw = values.markupPercentage;
    const markup =
      markupRaw === "" || markupRaw == null
        ? null
        : Number(markupRaw);
    if (markup != null && !Number.isFinite(markup)) {
      alert("Markup must be a number.");
      return;
    }
    onSubmit({
      name: values.name.trim(),
      location: values.location.trim(),
      clientId: values.clientId || null,
      markupPercentage: markup,
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

        <label>
          <span>Billing client</span>
          <select
            name="clientId"
            value={values.clientId || ""}
            onChange={handleChange}
          >
            <option value="">None</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Markup % override</span>
          <input
            name="markupPercentage"
            type="number"
            step="any"
            value={values.markupPercentage ?? ""}
            onChange={handleChange}
            placeholder="Use client default if blank"
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

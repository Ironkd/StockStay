import React, { useEffect, useState } from "react";
import { Client, Property, PropertyFormValues, StockLocation } from "../types";

type Props = {
  initialValues?: Property;
  clients?: Client[];
  stockLocations?: StockLocation[];
  /** Pre-select location ids when creating (default: first location) */
  defaultStockLocationIds?: string[];
  onSubmit: (values: PropertyFormValues) => void | Promise<void>;
  onCancel?: () => void;
};

const defaultValues: PropertyFormValues = {
  name: "",
  location: "",
  clientId: null,
  markupPercentage: null,
  stockLocationIds: [],
  newClient: null,
};

export const PropertyForm: React.FC<Props> = ({
  initialValues,
  clients = [],
  stockLocations = [],
  defaultStockLocationIds,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<PropertyFormValues>(() =>
    initialValues
      ? {
          name: initialValues.name,
          location: initialValues.location,
          clientId: initialValues.clientId ?? null,
          markupPercentage:
            initialValues.markupPercentage != null
              ? String(initialValues.markupPercentage)
              : "",
          stockLocationIds: [],
          newClient: null,
        }
      : {
          ...defaultValues,
          stockLocationIds:
            defaultStockLocationIds?.length
              ? [...defaultStockLocationIds]
              : stockLocations[0]
                ? [stockLocations[0].id]
                : [],
        }
  );
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientMarkup, setNewClientMarkup] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialValues) return;
    if (values.stockLocationIds?.length) return;
    if (defaultStockLocationIds?.length) {
      setValues((prev) => ({ ...prev, stockLocationIds: [...defaultStockLocationIds] }));
      return;
    }
    if (stockLocations[0]) {
      setValues((prev) => ({ ...prev, stockLocationIds: [stockLocations[0].id] }));
    }
  }, [stockLocations, defaultStockLocationIds, initialValues, values.stockLocationIds?.length]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "clientId") {
      setCreatingClient(false);
      setValues((prev) => ({ ...prev, clientId: value || null, newClient: null }));
      return;
    }
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const toggleLocation = (id: string) => {
    setValues((prev) => {
      const current = prev.stockLocationIds || [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return { ...prev, stockLocationIds: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      markupRaw === "" || markupRaw == null ? null : Number(markupRaw);
    if (markup != null && !Number.isFinite(markup)) {
      alert("Markup must be a number.");
      return;
    }

    let clientId = values.clientId || null;
    let newClient: PropertyFormValues["newClient"] = null;
    if (creatingClient) {
      if (!newClientName.trim() || !newClientEmail.trim()) {
        alert("New client needs a name and email.");
        return;
      }
      newClient = {
        name: newClientName.trim(),
        email: newClientEmail.trim(),
        defaultMarkupPercentage: Number(newClientMarkup) || 0,
      };
      clientId = null;
    }

    setBusy(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        location: values.location.trim(),
        clientId,
        markupPercentage: markup,
        stockLocationIds: initialValues ? undefined : values.stockLocationIds || [],
        newClient,
      });
      if (!initialValues) {
        setValues({
          ...defaultValues,
          stockLocationIds: stockLocations[0] ? [stockLocations[0].id] : [],
        });
        setCreatingClient(false);
        setNewClientName("");
        setNewClientEmail("");
        setNewClientMarkup("0");
      }
    } finally {
      setBusy(false);
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
            value={creatingClient ? "__new__" : values.clientId || ""}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setCreatingClient(true);
                setValues((prev) => ({ ...prev, clientId: null }));
                return;
              }
              handleChange(e);
            }}
          >
            <option value="">None (needed to replenish)</option>
            <option value="__new__">Create new client…</option>
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

      {creatingClient && (
        <div
          className="form-grid"
          style={{
            marginTop: "12px",
            padding: "12px",
            background: "#f8fafc",
            borderRadius: "8px",
          }}
        >
          <label>
            <span>Client name *</span>
            <input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Client or company name"
              required
            />
          </label>
          <label>
            <span>Client email *</span>
            <input
              type="email"
              value={newClientEmail}
              onChange={(e) => setNewClientEmail(e.target.value)}
              placeholder="billing@example.com"
              required
            />
          </label>
          <label>
            <span>Default markup %</span>
            <input
              type="number"
              step="any"
              value={newClientMarkup}
              onChange={(e) => setNewClientMarkup(e.target.value)}
            />
          </label>
        </div>
      )}

      {!initialValues && stockLocations.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <strong style={{ display: "block", marginBottom: "8px" }}>
            Link stock locations
          </strong>
          <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#64748b" }}>
            Defaults to Central supply so you can replenish without a separate link step.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {stockLocations.map((loc) => (
              <label key={loc.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={(values.stockLocationIds || []).includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                />
                <span>{loc.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : initialValues ? "Save changes" : "Add property"}
        </button>
      </div>
    </form>
  );
};

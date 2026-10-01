import React from "react";
import { Client, Property, PropertyFormValues, StockLocation, SupplyItem } from "../types";
import { Button, FormField, Icon } from "./ui";

type Props = {
  initialValues?: Property;
  clients?: Client[];
  stockLocations?: StockLocation[];
  supplyItems?: SupplyItem[];
  supplyItemsLoading?: boolean;
  supplyItemsLoadError?: boolean;
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
  supplyItems = [],
  supplyItemsLoading = false,
  supplyItemsLoadError = false,
  defaultStockLocationIds,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = React.useState<PropertyFormValues>(() =>
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
  const [creatingClient, setCreatingClient] = React.useState(false);
  const [newClientName, setNewClientName] = React.useState("");
  const [newClientEmail, setNewClientEmail] = React.useState("");
  const [newClientMarkup, setNewClientMarkup] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [stockedItemsOpen, setStockedItemsOpen] = React.useState(false);
  const [stockedSupplyItems, setStockedSupplyItems] = React.useState<
    Array<{ supplyItemId: string; parQuantity: string }>
  >([]);

  const activeSupplyItems = supplyItems
    .filter((item) => !item.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  React.useEffect(() => {
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

  const toggleStockedItem = (supplyItemId: string) => {
    setStockedSupplyItems((current) =>
      current.some((item) => item.supplyItemId === supplyItemId)
        ? current.filter((item) => item.supplyItemId !== supplyItemId)
        : [...current, { supplyItemId, parQuantity: "0" }]
    );
  };

  const updateStockedItemPar = (supplyItemId: string, parQuantity: string) => {
    setStockedSupplyItems((current) =>
      current.map((item) =>
        item.supplyItemId === supplyItemId ? { ...item, parQuantity } : item
      )
    );
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
    const markup = markupRaw === "" || markupRaw == null ? null : Number(markupRaw);
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
        stockedSupplyItems: initialValues
          ? undefined
          : stockedSupplyItems.map((item) => ({
              supplyItemId: item.supplyItemId,
              parQuantity: Number(item.parQuantity) || 0,
            })),
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
        setStockedSupplyItems([]);
        setStockedItemsOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="inventory-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <FormField label="Property name" required>
          {(inputProps) => (
            <input
              {...inputProps}
              name="name"
              value={values.name}
              onChange={handleChange}
              placeholder="e.g. Main Property"
              required
            />
          )}
        </FormField>

        <FormField label="Location" required>
          {(inputProps) => (
            <input
              {...inputProps}
              name="location"
              value={values.location}
              onChange={handleChange}
              placeholder="e.g. 123 Main St, City, State"
              required
            />
          )}
        </FormField>

        <FormField label="Billing client">
          {(inputProps) => (
            <select
              {...inputProps}
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
          )}
        </FormField>

        <FormField label="Markup % override" hint="Use client default if blank">
          {(inputProps) => (
            <input
              {...inputProps}
              name="markupPercentage"
              type="number"
              step="any"
              value={values.markupPercentage ?? ""}
              onChange={handleChange}
              placeholder="Use client default if blank"
            />
          )}
        </FormField>
      </div>

      {creatingClient && (
        <div className="form-grid property-form-new-client">
          <FormField label="Client name" required>
            {(inputProps) => (
              <input
                {...inputProps}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client or company name"
                required
              />
            )}
          </FormField>
          <FormField label="Client email" required>
            {(inputProps) => (
              <input
                {...inputProps}
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="billing@example.com"
                required
              />
            )}
          </FormField>
          <FormField label="Default markup %">
            {(inputProps) => (
              <input
                {...inputProps}
                type="number"
                step="any"
                value={newClientMarkup}
                onChange={(e) => setNewClientMarkup(e.target.value)}
              />
            )}
          </FormField>
        </div>
      )}

      {!initialValues && stockLocations.length > 0 && (
        <fieldset className="property-form-linked-locations">
          <legend className="property-form-section-title">Link stock locations</legend>
          <p className="property-form-section-copy">
            Defaults to Central supply so you can replenish without a separate link step.
          </p>
          <div className="property-form-location-list">
            {stockLocations.map((loc) => (
              <label key={loc.id} className="property-form-location-option">
                <input
                  type="checkbox"
                  checked={(values.stockLocationIds || []).includes(loc.id)}
                  onChange={() => toggleLocation(loc.id)}
                />
                <span>{loc.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {!initialValues && (
        <section className="property-create-stocked-items">
          <button
            type="button"
            className="property-create-stocked-items-toggle"
            aria-expanded={stockedItemsOpen}
            aria-controls="property-create-stocked-items-content"
            onClick={() => setStockedItemsOpen((open) => !open)}
          >
            <span className="property-create-stocked-items-toggle-copy">
              <Icon name={stockedItemsOpen ? "chevron-down" : "chevron-right"} size={16} />
              <span>Set up stocked items (optional)</span>
            </span>
            <span className="property-create-stocked-items-summary">
              {stockedSupplyItems.length > 0
                ? `${stockedSupplyItems.length} selected`
                : stockedItemsOpen
                  ? "Hide"
                  : "Add now"}
            </span>
          </button>
          <p className="property-create-stocked-items-description">
            Choose the supplies this property receives and set par quantities. You can skip this and add them later.
          </p>
          {stockedItemsOpen && (
            <div id="property-create-stocked-items-content" className="property-create-stocked-items-content">
              {supplyItemsLoadError ? (
                <p className="property-create-stocked-items-message" role="alert">
                  Supply items could not be loaded. You can add them from the property page after creating it.
                </p>
              ) : supplyItemsLoading ? (
                <p className="property-create-stocked-items-message">Loading supply items…</p>
              ) : activeSupplyItems.length === 0 ? (
                <p className="property-create-stocked-items-message">
                  No supply items are available yet. You can add them from the Stock section first.
                </p>
              ) : (
                <div className="property-create-stocked-items-list">
                  {activeSupplyItems.map((item) => {
                    const selected = stockedSupplyItems.find(
                      (stockedItem) => stockedItem.supplyItemId === item.id
                    );
                    return (
                      <div key={item.id} className="property-create-stocked-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(selected)}
                            onChange={() => toggleStockedItem(item.id)}
                          />
                          <span>{item.name}</span>
                        </label>
                        {selected && (
                          <label className="property-create-stocked-item-par">
                            <span>Par quantity</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={selected.parQuantity}
                              onChange={(event) =>
                                updateStockedItemPar(item.id, event.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="form-actions">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initialValues ? "Save changes" : "Add property"}
        </Button>
      </div>
    </form>
  );
};

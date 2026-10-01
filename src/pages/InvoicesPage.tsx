import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { useClients } from "../hooks/useClients";
import { useInvoices } from "../hooks/useInvoices";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  Modal,
  SectionHeader,
} from "../components/ui";
import { replenishmentApi } from "../services/replenishmentApi";
import { teamApi } from "../services/teamApi";
import { invoicesApi } from "../services/invoicesApi";
import { Invoice, InvoiceItem, UnbilledLine } from "../types";

const PAGE_SIZE = 20;
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type InvoiceSectionKey = "unbilled" | "soldByMonth" | "activeInvoices" | "sentInvoices";

type CollapsibleSectionProps = {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  open,
  onToggle,
  controls,
  children,
  className,
}) => (
  <Card className={className}>
    <div className="invoice-section-header" onClick={onToggle}>
      <h3>{title}</h3>
      <div
        className="invoice-section-header-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {controls}
        <button
          type="button"
          className="collapse-toggle"
          onClick={onToggle}
          title={open ? "Hide section" : "Show section"}
          aria-label={open ? "Collapse section" : "Expand section"}
          aria-expanded={open}
        >
          <span className="sr-only">
            {open ? "Collapse section" : "Expand section"}
          </span>
        </button>
      </div>
    </div>
    {open ? children : null}
  </Card>
);

const getStatusTone = (status: Invoice["status"]) => {
  switch (status) {
    case "paid":
      return "success" as const;
    case "sent":
      return "info" as const;
    case "overdue":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";

const getBillingPeriodLabel = (invoice: Invoice) => {
  if (!invoice.billingPeriodStart || !invoice.billingPeriodEnd) return "—";
  return `${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`;
};

export const InvoicesPage: React.FC = () => {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const propertyIdFilter = searchParams.get("propertyId") || "";
  const { invoices, addInvoice, updateInvoice, removeInvoice, refresh: refreshInvoices } = useInvoices();
  const { clients } = useClients();
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sendPreviewInvoice, setSendPreviewInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [senderBranding, setSenderBranding] = useState<{
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
  } | null>(null);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [sectionVisibility, setSectionVisibility] = useState<Record<InvoiceSectionKey, boolean>>({
    unbilled: true,
    soldByMonth: true,
    activeInvoices: true,
    sentInvoices: true,
  });
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    clientId: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    items: [] as InvoiceItem[],
    tax: 0,
    status: "draft" as Invoice["status"],
    notes: "",
  });
  const [currentItem, setCurrentItem] = useState({
    name: "",
    quantity: 1,
    unitPrice: 0,
  });

  const toggleSection = (section: InvoiceSectionKey) => {
    setSectionVisibility((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  useEffect(() => {
    const onRefresh = () => refreshInvoices();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    window.addEventListener("invoices-refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("invoices-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshInvoices]);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .getTeam()
      .then((data) => {
        if (cancelled) return;
        const t = data.team;
        const style = t.invoiceStyle ?? {};
        setSenderBranding({
          companyName: (style.companyName ?? t.name ?? "Stock Stay").trim() || t.name || "Stock Stay",
          companyAddress: (style.companyAddress ?? "").trim(),
          companyPhone: (style.companyPhone ?? "").trim(),
          companyEmail: (style.companyEmail ?? "").trim(),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    replenishmentApi
      .listUnbilled()
      .then((rows) => {
        if (!cancelled) setUnbilledLines(rows);
      })
      .catch(() => {
        if (!cancelled) setUnbilledLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [invoices.length]);

  const visibleUnbilledLines = useMemo(() => {
    if (!propertyIdFilter) return unbilledLines;
    return unbilledLines.filter((line) => line.property?.id === propertyIdFilter);
  }, [propertyIdFilter, unbilledLines]);

  const unbilledTotals = useMemo(() => {
    let charges = 0;
    let credits = 0;
    for (const line of visibleUnbilledLines) {
      const amount = Number(line.billBackAmount) || 0;
      if (amount >= 0) charges += amount;
      else credits += amount;
    }
    return { charges, credits, net: charges + credits };
  }, [visibleUnbilledLines]);

  const calculations = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal * formData.tax) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [formData.items, formData.tax]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearList = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i += 1) {
      yearList.push(i);
    }
    return yearList;
  }, []);

  const soldByMonth = useMemo(() => {
    const inMonth = (date: string) => {
      const parsed = new Date(date);
      return parsed.getFullYear() === selectedYear && parsed.getMonth() + 1 === selectedMonth;
    };
    const monthInvoices = invoices.filter((invoice) => inMonth(invoice.date));
    const byClient = new Map<string, { clientName: string; invoices: Invoice[] }>();
    for (const invoice of monthInvoices) {
      const existing = byClient.get(invoice.clientId);
      if (existing) {
        existing.invoices.push(invoice);
      } else {
        byClient.set(invoice.clientId, {
          clientName: invoice.clientName,
          invoices: [invoice],
        });
      }
    }
    return Array.from(byClient.entries()).map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      invoices: data.invoices,
    }));
  }, [invoices, selectedMonth, selectedYear]);

  const { monthlyTotal, yearlyTotal } = useMemo(() => {
    const inMonth = (date: string) => {
      const parsed = new Date(date);
      return parsed.getFullYear() === selectedYear && parsed.getMonth() + 1 === selectedMonth;
    };
    const inYear = (date: string) => new Date(date).getFullYear() === selectedYear;
    const monthly = invoices
      .filter((invoice) => inMonth(invoice.date))
      .reduce((sum, invoice) => sum + (invoice.total ?? 0), 0);
    const yearly = invoices
      .filter((invoice) => inYear(invoice.date))
      .reduce((sum, invoice) => sum + (invoice.total ?? 0), 0);
    return { monthlyTotal: monthly, yearlyTotal: yearly };
  }, [invoices, selectedMonth, selectedYear]);

  const closeForm = () => {
    setFormData({
      invoiceNumber: "",
      clientId: "",
      date: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      items: [],
      tax: 0,
      status: "draft",
      notes: "",
    });
    setCurrentItem({ name: "", quantity: 1, unitPrice: 0 });
    setEditingInvoice(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    closeForm();
    setShowForm(true);
  };

  const addItemToInvoice = () => {
    if (!currentItem.name.trim() || currentItem.quantity <= 0) {
      toast.error("Please enter an item name and quantity");
      return;
    }

    const newItem: InvoiceItem = {
      id: crypto.randomUUID(),
      name: currentItem.name.trim(),
      quantity: currentItem.quantity,
      unitPrice: currentItem.unitPrice,
      total: currentItem.quantity * currentItem.unitPrice,
    };

    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setCurrentItem({ name: "", quantity: 1, unitPrice: 0 });
  };

  const removeItemFromInvoice = (itemId: string) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNumber || !formData.clientId) {
      toast.error("Invoice number and client are required");
      return;
    }

    const selectedClient = clients.find((client) => client.id === formData.clientId);
    if (!selectedClient) {
      toast.error("Please select a valid client");
      return;
    }

    const isScheduled =
      Boolean(editingInvoice?.billingPeriodStart) ||
      Boolean(editingInvoice?.lines && editingInvoice.lines.length > 0);

    const invoiceData = isScheduled
      ? {
          taxRate: Math.round(formData.tax * 100) / 100,
          notes: formData.notes,
          status: formData.status,
          dueDate: formData.dueDate,
          date: formData.date,
        }
      : {
          ...formData,
          tax: Math.round(formData.tax * 100) / 100,
          clientName: selectedClient.name,
          subtotal: calculations.subtotal,
          total: calculations.total,
        };

    const wasPreviouslySent = editingInvoice?.status === "sent";

    try {
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, invoiceData as Parameters<typeof updateInvoice>[1]);
      } else if (!isScheduled) {
        await addInvoice(invoiceData as Parameters<typeof addInvoice>[0]);
      } else {
        throw new Error("Cannot create a scheduled invoice from this form.");
      }

      await refreshInvoices();

      if (wasPreviouslySent && editingInvoice) {
        toast.success(
          `An updated invoice for ${editingInvoice.clientName} has been sent with the latest changes.`
        );
      } else {
        toast.success(editingInvoice ? "Invoice updated" : "Invoice created");
      }

      closeForm();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("There was a problem saving this invoice. Please try again.");
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    const taxRate =
      invoice.taxRate != null && invoice.taxRate !== undefined
        ? Number(invoice.taxRate)
        : invoice.subtotal && invoice.subtotal !== 0
          ? (invoice.tax / invoice.subtotal) * 100
          : Number(invoice.tax);
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      items: invoice.items,
      tax: Math.round((taxRate || 0) * 100) / 100,
      status: invoice.status,
      notes: invoice.notes || "",
    });
    setShowForm(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteInvoiceId) return;
    removeInvoice(deleteInvoiceId);
    toast.success("Invoice deleted");
    setDeleteInvoiceId(null);
  };

  const handleSendConfirm = async () => {
    if (!sendPreviewInvoice) return;
    const clientEmail = clients.find((client) => client.id === sendPreviewInvoice.clientId)?.email?.trim();
    if (!clientEmail) {
      toast.error("No email address for this client. Add an email in Clients before sending.");
      return;
    }
    setSendingInvoice(true);
    try {
      await invoicesApi.send(sendPreviewInvoice.id);
      await refreshInvoices();
      setSendPreviewInvoice(null);
      toast.success(`Invoice #${sendPreviewInvoice.invoiceNumber} sent to ${clientEmail}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invoice. Please try again.";
      toast.error(message);
    } finally {
      setSendingInvoice(false);
    }
  };

  const { activeInvoices, sentInvoices } = useMemo(() => {
    const active = invoices.filter((invoice) => invoice.status !== "sent");
    const sent = invoices
      .filter((invoice) => invoice.status === "sent")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { activeInvoices: active, sentInvoices: sent };
  }, [invoices]);

  const activeTotalPages = Math.max(1, Math.ceil(activeInvoices.length / PAGE_SIZE));
  const sentTotalPages = Math.max(1, Math.ceil(sentInvoices.length / PAGE_SIZE));
  const activeCurrentPage = Math.min(activePage, activeTotalPages);
  const sentCurrentPage = Math.min(sentPage, sentTotalPages);
  const pagedActiveInvoices = useMemo(() => {
    const start = (activeCurrentPage - 1) * PAGE_SIZE;
    return activeInvoices.slice(start, start + PAGE_SIZE);
  }, [activeCurrentPage, activeInvoices]);
  const pagedSentInvoices = useMemo(() => {
    const start = (sentCurrentPage - 1) * PAGE_SIZE;
    return sentInvoices.slice(start, start + PAGE_SIZE);
  }, [sentCurrentPage, sentInvoices]);

  const previewClientEmail = sendPreviewInvoice
    ? clients.find((client) => client.id === sendPreviewInvoice.clientId)?.email?.trim()
    : "";

  const renderInvoiceRows = (invoiceList: Invoice[]) =>
    invoiceList.map((invoice) => (
      <tr key={invoice.id}>
        <td>
          <div className="invoice-table-primary">#{invoice.invoiceNumber}</div>
          <div className="invoice-table-secondary">{invoice.clientName}</div>
        </td>
        <td>{formatDate(invoice.date)}</td>
        <td>{formatDate(invoice.dueDate)}</td>
        <td>{getBillingPeriodLabel(invoice)}</td>
        <td>{formatCurrency(invoice.total)}</td>
        <td>
          <Badge tone={getStatusTone(invoice.status)}>{invoice.status.toUpperCase()}</Badge>
        </td>
        <td>
          <div className="invoice-actions">
            {canWrite && invoice.status !== "sent" && (
              <Button
                size="sm"
                className="invoice-send-button"
                onClick={() => setSendPreviewInvoice(invoice)}
                title="Send to client (HTML + PDF)"
                disabled={invoice.status === "paid"}
              >
                Send
              </Button>
            )}
            <button
              className="icon-button"
              onClick={() =>
                invoicesApi
                  .exportCsv(invoice.id, invoice.invoiceNumber)
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Export failed")
                  )
              }
              title="Export CSV"
              aria-label={`Export invoice ${invoice.invoiceNumber} as CSV`}
            >
              <Icon name="download" size={16} />
            </button>
            {canWrite && (
              <>
                <button
                  className="icon-button"
                  onClick={() => handleEdit(invoice)}
                  title="Edit"
                  aria-label={`Edit invoice ${invoice.invoiceNumber}`}
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setDeleteInvoiceId(invoice.id)}
                  title="Delete"
                  aria-label={`Delete invoice ${invoice.invoiceNumber}`}
                >
                  <Icon name="delete" size={16} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    ));

  return (
    <div className="invoices-page">
      <ConfirmDialog
        open={Boolean(deleteInvoiceId)}
        title="Delete invoice"
        message="Are you sure you want to delete this invoice?"
        confirmLabel="Delete"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteInvoiceId(null)}
      />

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingInvoice ? "Edit invoice" : "Create invoice"}
        maxWidth="960px"
      >
        <p className="modal-intro">
          {editingInvoice
            ? "Update invoice dates, status, line items, and notes before sending or exporting."
            : "Create a one-off invoice for a client. Scheduled draft invoices still come from Generate drafts."}
        </p>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="form-grid invoice-form-grid">
            <FormField label="Invoice number" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, invoiceNumber: e.target.value })
                  }
                  required
                />
              )}
            </FormField>
            <FormField label="Client" required>
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={formData.clientId}
                  onChange={(e) =>
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Date" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              )}
            </FormField>
            <FormField label="Due date" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                  required
                />
              )}
            </FormField>
            <FormField label="Tax (%)">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  value={formData.tax}
                  onChange={(e) =>
                    setFormData({ ...formData, tax: Number(e.target.value) })
                  }
                  min={0}
                  step={0.01}
                />
              )}
            </FormField>
            <FormField label="Status">
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as Invoice["status"],
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              )}
            </FormField>
          </div>

          <div className="invoice-items-section">
            <div className="invoice-items-heading">
              <div>
                <h4>Items</h4>
                <p>Add one or more line items to calculate totals.</p>
              </div>
            </div>
            <div className="form-grid invoice-form-grid">
              <FormField label="Item name" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="text"
                    value={currentItem.name}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, name: e.target.value })
                    }
                    placeholder="e.g. Cleaning supplies"
                  />
                )}
              </FormField>
              <FormField label="Quantity" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    value={currentItem.quantity}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        quantity: Number(e.target.value),
                      })
                    }
                    min={1}
                  />
                )}
              </FormField>
              <FormField label="Unit price" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    value={currentItem.unitPrice}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        unitPrice: Number(e.target.value),
                      })
                    }
                    min={0}
                    step={0.01}
                  />
                )}
              </FormField>
              <div className="field invoice-item-action">
                <span className="field-label">Action</span>
                <Button
                  variant="secondary"
                  onClick={addItemToInvoice}
                  disabled={!currentItem.name.trim() || currentItem.quantity <= 0}
                >
                  Add Item
                </Button>
              </div>
            </div>

            {formData.items.length > 0 ? (
              <div className="invoice-table-wrap">
                <table className="inventory-table invoice-line-items-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unitPrice)}</td>
                        <td>{formatCurrency(item.total)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => item.id && removeItemFromInvoice(item.id)}
                            className="icon-button"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Icon name="delete" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No items yet" body="Add line items to build the invoice total." />
            )}

            <div className="invoice-totals">
              <div>
                <strong>Subtotal:</strong> {formatCurrency(calculations.subtotal)}
              </div>
              <div>
                <strong>Tax:</strong> {formatCurrency(calculations.taxAmount)}
              </div>
              <div className="invoice-total">
                <strong>Total:</strong> {formatCurrency(calculations.total)}
              </div>
            </div>
          </div>

          <FormField label="Notes" className="notes-field">
            {(inputProps) => (
              <textarea
                {...inputProps}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            )}
          </FormField>

          <div className="form-actions">
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">
              {editingInvoice ? "Save Changes" : "Create Invoice"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(sendPreviewInvoice)}
        onClose={() => setSendPreviewInvoice(null)}
        title={`Preview — Invoice from ${senderBranding?.companyName ?? "you"}`}
        maxWidth="640px"
        busy={sendingInvoice}
        className="modal-content invoice-send-preview-modal"
      >
        {sendPreviewInvoice && (
          <div className="invoice-send-preview">
            <p className="modal-intro">This is how the invoice will look when sent by email.</p>
            <div className="invoice-preview-sheet">
              {senderBranding &&
              (senderBranding.companyName ||
                senderBranding.companyAddress ||
                senderBranding.companyPhone ||
                senderBranding.companyEmail) ? (
                <div className="invoice-preview-block">
                  <p className="invoice-preview-label">From</p>
                  <p className="invoice-preview-copy">
                    {senderBranding.companyName}
                    {senderBranding.companyAddress
                      ? `\n${senderBranding.companyAddress
                          .split(/\n/)
                          .filter((line) => line.trim())
                          .join("\n")}`
                      : ""}
                    {senderBranding.companyPhone ? `\nTel: ${senderBranding.companyPhone}` : ""}
                    {senderBranding.companyEmail ? `\n${senderBranding.companyEmail}` : ""}
                  </p>
                </div>
              ) : null}

              <div className="invoice-preview-block">
                <p className="invoice-preview-label">Bill to</p>
                <p className="invoice-preview-copy invoice-preview-copy--strong">
                  {sendPreviewInvoice.clientName}
                </p>
              </div>

              <div className="invoice-preview-meta">
                <p>
                  <strong>Invoice</strong> {sendPreviewInvoice.invoiceNumber}
                </p>
                <p>
                  <strong>Date:</strong> {formatDate(sendPreviewInvoice.date)}
                </p>
                <p>
                  <strong>Due date:</strong> {formatDate(sendPreviewInvoice.dueDate)}
                </p>
              </div>

              <div className="invoice-table-wrap">
                <table className="inventory-table invoice-preview-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sendPreviewInvoice.items || []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unitPrice)}</td>
                        <td>{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="invoice-preview-summary">
                <p>
                  <strong>Subtotal:</strong> {formatCurrency(sendPreviewInvoice.subtotal)}
                </p>
                <p>
                  <strong>Tax:</strong> {formatCurrency(sendPreviewInvoice.tax)}
                </p>
                <p className="invoice-preview-total">
                  <strong>Total:</strong> {formatCurrency(sendPreviewInvoice.total)}
                </p>
              </div>

              {sendPreviewInvoice.notes && (
                <p className="invoice-preview-notes">{sendPreviewInvoice.notes}</p>
              )}
            </div>

            <p className="invoice-preview-recipient">
              This will be sent to: <strong>{previewClientEmail || "—"}</strong>
            </p>
            {!previewClientEmail && (
              <p className="form-banner error">
                No email for this client. Add an email in Clients before sending.
              </p>
            )}
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => setSendPreviewInvoice(null)}
                disabled={sendingInvoice}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendConfirm}
                disabled={sendingInvoice || !previewClientEmail}
              >
                {sendingInvoice ? "Sending…" : `Send to ${previewClientEmail || "client"}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <SectionHeader
        title="Billing"
        description={
          <>
            Generate scheduled drafts from unbilled replenishment, then review, email (PDF), or export CSV.
            {generateMessage ? (
              <span className="billing-generate-message">{generateMessage}</span>
            ) : null}
          </>
        }
        actions={
          <div className="invoice-totals-bar">
            <span className="invoice-total-item">
              <strong>Monthly total</strong> ({monthNames[selectedMonth - 1]} {selectedYear}):{" "}
              {formatCurrency(monthlyTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Yearly total</strong> ({selectedYear}): {formatCurrency(yearlyTotal)}
            </span>
          </div>
        }
      />

      <div className="section-header-actions billing-page-actions">
        {canWrite ? (
          <Button
            disabled={generatingDrafts}
            onClick={async () => {
              setGeneratingDrafts(true);
              setGenerateMessage(null);
              try {
                const result = await invoicesApi.generateDrafts();
                setGenerateMessage(
                  result.count > 0
                    ? `Created ${result.count} draft invoice${result.count === 1 ? "" : "s"}.`
                    : "No new drafts — no closed periods with unbilled lines, or invoices already exist."
                );
                await refreshInvoices();
              } catch (err) {
                setGenerateMessage(
                  err instanceof Error ? err.message : "Failed to generate drafts"
                );
              } finally {
                setGeneratingDrafts(false);
              }
            }}
          >
            {generatingDrafts ? "Generating…" : "Generate drafts"}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await invoicesApi.exportAllCsv();
            } catch (err) {
              setGenerateMessage(err instanceof Error ? err.message : "CSV export failed");
            }
          }}
        >
          Export CSV
        </Button>
        {canWrite ? <Button onClick={openCreateForm}>Create Invoice</Button> : null}
      </div>

      <CollapsibleSection
        title={`Unbilled charges & credits (${visibleUnbilledLines.length})`}
        open={sectionVisibility.unbilled}
        onToggle={() => toggleSection("unbilled")}
        className="invoice-section-card"
      >
        <div className="invoice-section-body">
          <p className="invoice-section-copy">
            These lines are included when you click <strong>Generate drafts</strong> for each
            client&apos;s closed billing period (per client frequency, team timezone). Credits are
            returns with negative amounts.
            {propertyIdFilter ? " Filtered to the selected property." : ""}
          </p>
          {visibleUnbilledLines.length === 0 ? (
            <EmptyState
              title="No unbilled charges or credits"
              body="Closed-period replenishment will appear here before draft invoices are generated."
            />
          ) : (
            <>
              <div className="invoice-summary-row">
                <span>Charges {formatCurrency(unbilledTotals.charges)}</span>
                <span>Credits {formatCurrency(unbilledTotals.credits)}</span>
                <span>Net {formatCurrency(unbilledTotals.net)}</span>
              </div>
              <div className="invoice-table-wrap">
                <table className="inventory-table invoice-data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Client</th>
                      <th>Property</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUnbilledLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <Badge tone={line.isCredit ? "warning" : "info"}>
                            {line.isCredit ? "Credit" : "Charge"}
                          </Badge>
                        </td>
                        <td>{line.property?.client?.name || "—"}</td>
                        <td>{line.property?.name || "—"}</td>
                        <td>{line.supplyItem?.name || line.sku?.name || "—"}</td>
                        <td>{Number(line.baseQtyDeployed).toFixed(2)}</td>
                        <td className={line.isCredit ? "invoice-amount-negative" : undefined}>
                          {formatCurrency(Number(line.billBackAmount))}
                        </td>
                        <td>{formatDate(line.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Billed by month · Who received what"
        open={sectionVisibility.soldByMonth}
        onToggle={() => toggleSection("soldByMonth")}
        className="invoice-section-card sold-by-month-panel"
        controls={
          <div className="sold-by-month-controls">
            <FormField label="Year" className="month-picker-label">
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="month-picker"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Month" className="month-picker-label">
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="month-picker"
                >
                  {monthNames.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
        }
      >
        <div className="invoice-section-body">
          {soldByMonth.length === 0 ? (
            <EmptyState
              title={`No invoices in ${monthNames[selectedMonth - 1]} ${selectedYear}`}
              body="Create invoices to see billed items per client here."
            />
          ) : (
            <div className="sold-by-month-clients">
              {soldByMonth.map(({ clientId, clientName, invoices: clientInvoices }) => (
                <div key={clientId} className="sold-by-month-client">
                  <div className="sold-by-month-client-header">
                    <h4 className="sold-by-month-client-name">{clientName}</h4>
                    <span className="sold-by-month-client-total">
                      {formatCurrency(
                        clientInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
                      )}
                    </span>
                  </div>
                  <div className="invoice-table-wrap">
                    <table className="inventory-table sold-items-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Billed on</th>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientInvoices.flatMap((invoice) =>
                          invoice.items.map((item) => (
                            <tr key={`${invoice.id}-${item.id}`}> 
                              <td>
                                <div className="invoice-table-primary">#{invoice.invoiceNumber}</div>
                                <div className="invoice-table-secondary">{formatCurrency(invoice.total)}</div>
                              </td>
                              <td>{formatDate(invoice.date)}</td>
                              <td>{item.name}</td>
                              <td>{item.quantity}</td>
                              <td>{formatCurrency(item.unitPrice)}</td>
                              <td>{formatCurrency(item.total)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={`Active invoices (${activeInvoices.length})`}
        open={sectionVisibility.activeInvoices}
        onToggle={() => toggleSection("activeInvoices")}
        className="invoice-section-card"
      >
        <div className="invoice-section-body">
          {activeInvoices.length === 0 ? (
            <EmptyState
              title="No active invoices"
              body="Sent invoices are archived below. Drafts, overdue, and paid invoices stay here until sent."
              primaryLabel={canWrite ? "Create Invoice" : undefined}
              onPrimary={canWrite ? openCreateForm : undefined}
            />
          ) : (
            <>
              <div className="invoice-table-wrap">
                <table className="inventory-table invoice-data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Due date</th>
                      <th>Billing period</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>{renderInvoiceRows(pagedActiveInvoices)}</tbody>
                </table>
              </div>
              {activeInvoices.length > PAGE_SIZE ? (
                <div className="pagination-controls">
                  <Button
                    variant="secondary"
                    disabled={activeCurrentPage <= 1}
                    onClick={() => setActivePage((page) => Math.max(1, page - 1))}
                  >
                    Prev
                  </Button>
                  <span className="pagination-status">
                    Page {activeCurrentPage} of {activeTotalPages}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={activeCurrentPage >= activeTotalPages}
                    onClick={() =>
                      setActivePage((page) => Math.min(activeTotalPages, page + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={`Sent invoices (${sentInvoices.length})`}
        open={sectionVisibility.sentInvoices}
        onToggle={() => toggleSection("sentInvoices")}
        className="invoice-section-card"
      >
        <div className="invoice-section-body">
          {sentInvoices.length === 0 ? (
            <EmptyState
              title="No sent invoices yet"
              body="Invoices are automatically archived here once they are sent to clients."
            />
          ) : (
            <>
              <div className="invoice-table-wrap">
                <table className="inventory-table invoice-data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Due date</th>
                      <th>Billing period</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>{renderInvoiceRows(pagedSentInvoices)}</tbody>
                </table>
              </div>
              {sentInvoices.length > PAGE_SIZE ? (
                <div className="pagination-controls">
                  <Button
                    variant="secondary"
                    disabled={sentCurrentPage <= 1}
                    onClick={() => setSentPage((page) => Math.max(1, page - 1))}
                  >
                    Prev
                  </Button>
                  <span className="pagination-status">
                    Page {sentCurrentPage} of {sentTotalPages}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={sentCurrentPage >= sentTotalPages}
                    onClick={() =>
                      setSentPage((page) => Math.min(sentTotalPages, page + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};

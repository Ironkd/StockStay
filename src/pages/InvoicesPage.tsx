import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useClients } from "../hooks/useClients";
import {
  invoicesApi,
  type PaginatedInvoiceListResponse,
  type InvoiceListSummary,
} from "../services/invoicesApi";
import { teamApi } from "../services/teamApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { Invoice, InvoiceItem, UnbilledLine } from "../types";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { SectionHeader } from "../components/ui/SectionHeader";
import { formatCurrency } from "../utils/format";

const PAGE_SIZE = 20;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const EMPTY_SUMMARY: InvoiceListSummary = {
  draftTotal: 0,
  draftCount: 0,
  outstandingTotal: 0,
  outstandingCount: 0,
  overdueTotal: 0,
  overdueCount: 0,
  issuedMonthTotal: 0,
  issuedMonthCount: 0,
  issuedYearTotal: 0,
  issuedYearCount: 0,
};

const createEmptyPaginatedResponse = (): PaginatedInvoiceListResponse => ({
  active: { invoices: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
  sent: { invoices: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
  soldByMonth: [],
  summary: EMPTY_SUMMARY,
});

const formatCalendarDate = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const stringValue = typeof value === "string" ? value : "";
  const dateOnlyMatch = stringValue.match(DATE_ONLY_PATTERN);
  const date = dateOnlyMatch
    ? new Date(Date.UTC(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      ))
    : value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
};

const getUtcYearMonth = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const stringValue = typeof value === "string" ? value : "";
  const dateOnlyMatch = stringValue.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    return {
      year: Number(dateOnlyMatch[1]),
      month: Number(dateOnlyMatch[2]),
    };
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
};

export const InvoicesPage: React.FC = () => {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const propertyIdFilter = searchParams.get("propertyId") || "";
  const { clients } = useClients();
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sendPreviewInvoice, setSendPreviewInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [senderBranding, setSenderBranding] = useState<{ companyName: string; companyAddress: string; companyPhone: string; companyEmail: string } | null>(null);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getUTCFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getUTCMonth() + 1);
  const [invoiceData, setInvoiceData] = useState<PaginatedInvoiceListResponse>(
    createEmptyPaginatedResponse
  );
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // Section visibility state
  const [sectionVisibility, setSectionVisibility] = useState({
    unbilled: true,
    soldByMonth: true,
    activeInvoices: true,
    sentInvoices: true
  });

  const toggleSection = (section: keyof typeof sectionVisibility) => {
    setSectionVisibility(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const loadUnbilledLines = useCallback(async () => {
    try {
      const rows = await replenishmentApi.listUnbilled();
      setUnbilledLines(rows);
    } catch {
      setUnbilledLines([]);
    }
  }, []);

  const refreshInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const data = await invoicesApi.getPaginatedList({
        activePage,
        sentPage,
        pageSize: PAGE_SIZE,
        month: selectedMonth,
        year: selectedYear,
      });
      setInvoiceData(data);
      setInvoiceError(null);
      if (data.active.page !== activePage) {
        setActivePage(data.active.page);
      }
      if (data.sent.page !== sentPage) {
        setSentPage(data.sent.page);
      }
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Failed to load invoices");
      setInvoiceData(createEmptyPaginatedResponse());
    } finally {
      setLoadingInvoices(false);
    }
  }, [activePage, sentPage, selectedMonth, selectedYear]);

  const refreshAllInvoiceData = useCallback(async () => {
    await Promise.all([refreshInvoices(), loadUnbilledLines()]);
  }, [refreshInvoices, loadUnbilledLines]);

  useEffect(() => {
    void refreshInvoices();
  }, [refreshInvoices]);

  useEffect(() => {
    void loadUnbilledLines();
  }, [loadUnbilledLines]);

  // Refetch when tab becomes visible so invoices stay in sync
  useEffect(() => {
    const onRefresh = () => {
      void refreshAllInvoiceData();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    window.addEventListener("invoices-refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("invoices-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshAllInvoiceData]);

  // Sender branding for invoice title and preview (company name, address, etc.)
  useEffect(() => {
    let cancelled = false;
    teamApi.getTeam().then((data) => {
      if (cancelled) return;
      const t = data.team;
      const style = t.invoiceStyle ?? {};
      setSenderBranding({
        companyName: (style.companyName ?? t.name ?? "Stock Stay").trim() || t.name || "Stock Stay",
        companyAddress: (style.companyAddress ?? "").trim(),
        companyPhone: (style.companyPhone ?? "").trim(),
        companyEmail: (style.companyEmail ?? "").trim(),
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const visibleUnbilledLines = useMemo(() => {
    if (!propertyIdFilter) return unbilledLines;
    return unbilledLines.filter((line) => line.property?.id === propertyIdFilter);
  }, [unbilledLines, propertyIdFilter]);

  const unbilledTotals = useMemo(() => {
    let charges = 0;
    let credits = 0;
    for (const line of visibleUnbilledLines) {
      const amt = Number(line.billBackAmount) || 0;
      if (amt >= 0) charges += amt;
      else credits += amt;
    }
    return { charges, credits, net: charges + credits };
  }, [visibleUnbilledLines]);

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
    notes: ""
  });

  const [currentItem, setCurrentItem] = useState({
    name: "",
    quantity: 1,
    unitPrice: 0
  });

  const resetForm = () => {
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
      notes: ""
    });
    setCurrentItem({ name: "", quantity: 1, unitPrice: 0 });
    setEditingInvoice(null);
    setShowForm(false);
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
    setFormData({
      ...formData,
      items: [...formData.items, newItem]
    });

    setCurrentItem({ name: "", quantity: 1, unitPrice: 0 });
  };

  const removeItemFromInvoice = (itemId: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter((item) => item.id !== itemId)
    });
  };

  const calculations = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal * formData.tax) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [formData.items, formData.tax]);

  // Generate years (current year ± 5 years) — snapshot once on mount
  const years = useMemo(() => {
    const currentYear = new Date().getUTCFullYear();
    const yearList = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      yearList.push(i);
    }
    return yearList;
  }, []);

  const soldByMonth = useMemo(() => {
    const byClient = new Map<string, { clientName: string; invoices: Invoice[] }>();
    for (const inv of invoiceData.soldByMonth) {
      const existing = byClient.get(inv.clientId);
      if (existing) existing.invoices.push(inv);
      else byClient.set(inv.clientId, { clientName: inv.clientName, invoices: [inv] });
    }
    return Array.from(byClient.entries()).map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      invoices: data.invoices
    }));
  }, [invoiceData.soldByMonth]);

  const summary = invoiceData.summary;
  const activeInvoices = invoiceData.active.invoices;
  const sentInvoices = invoiceData.sent.invoices;

  const statusOptions = useMemo(() => {
    if (!editingInvoice) {
      return [
        { value: "draft", label: "Draft" },
        { value: "sent", label: "Sent" },
      ];
    }

    switch (editingInvoice.status) {
      case "draft":
        return [
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
        ];
      case "sent":
        return [
          { value: "sent", label: "Sent" },
          { value: "overdue", label: "Overdue" },
          { value: "paid", label: "Paid" },
        ];
      case "overdue":
        return [
          { value: "overdue", label: "Overdue" },
          { value: "sent", label: "Sent" },
          { value: "paid", label: "Paid" },
        ];
      default:
        return [
          { value: "paid", label: "Paid" },
        ];
    }
  }, [editingInvoice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNumber || !formData.clientId) {
      toast.error("Invoice number and client are required");
      return;
    }

    const selectedClient = clients.find((c) => c.id === formData.clientId);
    if (!selectedClient) {
      toast.error("Please select a valid client");
      return;
    }

    const isScheduled =
      Boolean(editingInvoice?.billingPeriodStart) ||
      (editingInvoice?.lines && editingInvoice.lines.length > 0);

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

    // Remember if this invoice had already been sent before editing.
    const wasPreviouslySent = editingInvoice?.status === "sent";

    try {
      if (editingInvoice) {
        await invoicesApi.update(editingInvoice.id, invoiceData);
      } else if (!isScheduled) {
        await invoicesApi.create(invoiceData as Omit<Invoice, "id" | "createdAt" | "updatedAt">);
      } else {
        throw new Error("Cannot create a scheduled invoice from this form.");
      }

      await refreshAllInvoiceData();

      if (wasPreviouslySent && editingInvoice) {
        toast.success(
          `Invoice updated. ${editingInvoice.clientName} was not re-emailed automatically.`
        );
      } else {
        toast.success(editingInvoice ? "Invoice updated" : "Invoice created");
      }

      resetForm();
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
      notes: invoice.notes || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string) => {
    setDeleteInvoiceId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteInvoiceId) return;
    void (async () => {
      try {
        const result = await invoicesApi.delete(deleteInvoiceId);
        await refreshAllInvoiceData();
        toast.success(result?.message || "Invoice deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete invoice");
      } finally {
        setDeleteInvoiceId(null);
      }
    })();
  };

  const handleSendClick = (invoice: Invoice) => {
    setSendPreviewInvoice(invoice);
  };

  const handleSendConfirm = async () => {
    if (!sendPreviewInvoice) return;
    const clientEmail = clients.find((c) => c.id === sendPreviewInvoice.clientId)?.email?.trim();
    if (!clientEmail) {
      toast.error("No email address for this client. Add an email in Clients before sending.");
      return;
    }
    setSendingInvoice(true);
    try {
      await invoicesApi.send(sendPreviewInvoice.id);
      await refreshAllInvoiceData();
      setSendPreviewInvoice(null);
      toast.success(`Invoice #${sendPreviewInvoice.invoiceNumber} sent to ${clientEmail}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invoice. Please try again.";
      toast.error(message);
    } finally {
      setSendingInvoice(false);
    }
  };

  const getStatusColor = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return "#10b981";
      case "sent":
        return "#3b82f6";
      case "overdue":
        return "#ef4444";
      default:
        return "#64748b";
    }
  };

  const getInvoiceTitle = (_invoice: Invoice) => {
    // Show who the invoice is from (company/sender name), not the number
    return senderBranding?.companyName ?? "Invoice";
  };

  // Render invoice card component
  const renderInvoiceCard = (invoice: Invoice) => {
    return (
      <div key={invoice.id} className="invoice-card">
        <div className="invoice-header">
          <div>
            <h4>{getInvoiceTitle(invoice)}</h4>
            <p>{invoice.clientName} · #{invoice.invoiceNumber}</p>
          </div>
          <div className="invoice-meta">
            <span
              className="status-badge"
              style={{ backgroundColor: getStatusColor(invoice.status) }}
            >
              {invoice.status.toUpperCase()}
            </span>
            <div className="invoice-actions">
              {canWrite && invoice.status !== "sent" && (
                <button
                  onClick={() => handleSendClick(invoice)}
                  title="Send to client (HTML + PDF)"
                  disabled={invoice.status === "paid"}
                  style={{
                    backgroundColor: invoice.status === "paid" ? "#94a3b8" : "#3b82f6",
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: invoice.status === "paid" ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    marginRight: "8px"
                  }}
                >
                  Send
                </button>
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
                aria-label="Export CSV"
              >
                ⬇️
              </button>
              {canWrite && (
                <>
                  {invoice.status !== "paid" && (
                    <button
                      className="icon-button"
                      onClick={() => handleEdit(invoice)}
                      title="Edit"
                      aria-label="Edit invoice"
                    >
                      ✏️
                    </button>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => handleDelete(invoice.id)}
                    title="Delete"
                    aria-label="Delete invoice"
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="invoice-details">
          <p>
            <strong>Date:</strong> {formatCalendarDate(invoice.date)}
          </p>
          <p>
            <strong>Due Date:</strong>{" "}
            {formatCalendarDate(invoice.dueDate)}
          </p>
          {invoice.billingPeriodStart && invoice.billingPeriodEnd && (
            <p>
              <strong>Period:</strong>{" "}
              {formatCalendarDate(invoice.billingPeriodStart)} –{" "}
              {formatCalendarDate(invoice.billingPeriodEnd)}
            </p>
          )}
          <p>
            <strong>Total:</strong> {formatCurrency(invoice.total)}
            {invoice.lines && invoice.lines.length > 0
              ? ` · ${invoice.lines.length} line${invoice.lines.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </div>
    );
  };

  const previewClientEmail = sendPreviewInvoice
    ? clients.find((c) => c.id === sendPreviewInvoice.clientId)?.email?.trim()
    : "";

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
      {sendPreviewInvoice && (
        <div
          className="invoice-send-preview-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
          onClick={() => !sendingInvoice && setSendPreviewInvoice(null)}
        >
          <div
            className="invoice-send-preview-modal"
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
                Preview – Invoice from {senderBranding?.companyName ?? "you"}
              </h3>
              <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.9rem" }}>
                This is how the invoice will look when sent by email.
              </p>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  color: "#1e293b",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "20px",
                  backgroundColor: "#f8fafc",
                }}
              >
                {senderBranding && (senderBranding.companyName || senderBranding.companyAddress || senderBranding.companyPhone || senderBranding.companyEmail) && (
                  <div style={{ marginBottom: "16px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>From</p>
                    <p style={{ margin: "0", fontSize: "14px", lineHeight: 1.5, color: "#334155" }}>
                      {senderBranding.companyName}
                      {senderBranding.companyAddress && (
                        <>
                          <br />
                          {senderBranding.companyAddress.split(/\n/).filter((l) => l.trim()).map((line, i) => (
                            <span key={i}>{line}<br /></span>
                          ))}
                        </>
                      )}
                      {senderBranding.companyPhone && <><br />Tel: {senderBranding.companyPhone}</>}
                      {senderBranding.companyEmail && <><br />{senderBranding.companyEmail}</>}
                    </p>
                  </div>
                )}
                <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bill to</p>
                <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#334155" }}>{sendPreviewInvoice.clientName}</p>
                <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: "1rem" }}>
                  Invoice {sendPreviewInvoice.invoiceNumber}
                </p>
                <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>
                  <strong>Date:</strong> {formatCalendarDate(sendPreviewInvoice.date)}
                </p>
                <p style={{ margin: "0 0 16px", fontSize: "0.9rem" }}>
                  <strong>Due date:</strong>{" "}
                  {formatCalendarDate(sendPreviewInvoice.dueDate)}
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>Item</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Price</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sendPreviewInvoice.items || []).map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "8px 8px 8px 0" }}>{item.name}</td>
                        <td style={{ textAlign: "right", padding: "8px" }}>{item.quantity}</td>
                        <td style={{ textAlign: "right", padding: "8px" }}>
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td style={{ textAlign: "right", padding: "8px" }}>
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "0 0 4px", textAlign: "right", fontSize: "0.9rem" }}>
                  <strong>Subtotal:</strong> {formatCurrency(sendPreviewInvoice.subtotal)}
                </p>
                <p style={{ margin: "0 0 4px", textAlign: "right", fontSize: "0.9rem" }}>
                  <strong>Tax:</strong> {formatCurrency(sendPreviewInvoice.tax)}
                </p>
                <p style={{ margin: "0 0 0", textAlign: "right", fontSize: "1rem", fontWeight: 600 }}>
                  <strong>Total:</strong> {formatCurrency(sendPreviewInvoice.total)}
                </p>
                {sendPreviewInvoice.notes && (
                  <p style={{ marginTop: "12px", color: "#64748b", fontSize: "0.875rem" }}>
                    {sendPreviewInvoice.notes}
                  </p>
                )}
              </div>
              <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "#64748b" }}>
                This will be sent to: <strong style={{ color: "#1e293b" }}>{previewClientEmail || "—"}</strong>
              </p>
              {!previewClientEmail && (
                <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: "#dc2626" }}>
                  No email for this client. Add an email in Clients before sending.
                </p>
              )}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="nav-button secondary"
                  onClick={() => setSendPreviewInvoice(null)}
                  disabled={sendingInvoice}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nav-button primary"
                  onClick={handleSendConfirm}
                  disabled={sendingInvoice || !previewClientEmail}
                >
                  {sendingInvoice ? "Sending…" : `Send to ${previewClientEmail || "client"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SectionHeader
        title="Billing"
        description={
          <>
            Generate scheduled drafts from unbilled replenishment, then review, email (PDF), or export CSV.
            <span style={{ display: "block", marginTop: "8px" }}>
              Saving edits never silently re-sends a sent invoice.
            </span>
            {generateMessage && (
              <span style={{ display: "block", marginTop: "8px", color: "#0369a1" }}>{generateMessage}</span>
            )}
          </>
        }
        actions={
          <div className="invoice-totals-bar">
            <span className="invoice-total-item">
              <strong>Draft pipeline</strong> ({summary.draftCount}): {formatCurrency(summary.draftTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Outstanding</strong> (sent + overdue, {summary.outstandingCount}):{" "}
              {formatCurrency(summary.outstandingTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Overdue</strong> ({summary.overdueCount}): {formatCurrency(summary.overdueTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Issued in {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong> ({summary.issuedMonthCount}):{" "}
              {formatCurrency(summary.issuedMonthTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Issued in {selectedYear}</strong> ({summary.issuedYearCount}):{" "}
              {formatCurrency(summary.issuedYearTotal)}
            </span>
          </div>
        }
      />
      <div className="section-header-actions billing-page-actions">
          {canWrite && (
            <button
              type="button"
              className="nav-button primary"
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
                  await refreshAllInvoiceData();
                } catch (err) {
                  setGenerateMessage(err instanceof Error ? err.message : "Failed to generate drafts");
                } finally {
                  setGeneratingDrafts(false);
                }
              }}
            >
              {generatingDrafts ? "Generating…" : "Generate drafts"}
            </button>
          )}
          <button
            type="button"
            className="nav-button secondary"
            onClick={async () => {
              try {
                await invoicesApi.exportAllCsv();
              } catch (err) {
                setGenerateMessage(err instanceof Error ? err.message : "CSV export failed");
              }
            }}
          >
            Export CSV
          </button>
          {canWrite && (
            <button
              className="clear-button"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              {showForm ? "Cancel" : "Create Invoice"}
            </button>
          )}
        </div>

      {invoiceError && (
        <section className="panel">
          <div className="empty-state">
            Couldn&apos;t load invoices: {invoiceError}{" "}
            <button type="button" className="secondary" onClick={() => void refreshInvoices()}>
              Retry
            </button>
          </div>
        </section>
      )}

      {!invoiceError && loadingInvoices && (
        <p style={{ color: "#64748b", marginTop: "12px" }}>Loading invoices…</p>
      )}

      {showForm && (
        <section className="panel">
          <h3>{editingInvoice ? "Edit Invoice" : "Create New Invoice"}</h3>
          {editingInvoice?.status === "sent" && (
            <p style={{ color: "#64748b", marginTop: 0 }}>
              This invoice has already been emailed. Saving updates the record only and does not
              send a revised invoice automatically.
            </p>
          )}
          <form onSubmit={handleSubmit} className="inventory-form">
            <div className="form-grid">
              <label>
                <span>Invoice Number *</span>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, invoiceNumber: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Client *</span>
                <select
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
              </label>
              <label>
                <span>Date *</span>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Due Date *</span>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Tax (%)</span>
                <input
                  type="number"
                  value={formData.tax}
                  onChange={(e) =>
                    setFormData({ ...formData, tax: Number(e.target.value) })
                  }
                  min={0}
                  step={0.01}
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as Invoice["status"]
                    })
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="invoice-items-section">
              <h4>Items</h4>
              <div className="form-grid">
                <label>
                  <span>Item name *</span>
                  <input
                    type="text"
                    value={currentItem.name}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, name: e.target.value })
                    }
                    placeholder="e.g. Cleaning supplies"
                  />
                </label>
                <label>
                  <span>Quantity *</span>
                  <input
                    type="number"
                    value={currentItem.quantity}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        quantity: Number(e.target.value)
                      })
                    }
                    min={1}
                  />
                </label>
                <label>
                  <span>Unit price *</span>
                  <input
                    type="number"
                    value={currentItem.unitPrice}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        unitPrice: Number(e.target.value)
                      })
                    }
                    min={0}
                    step={0.01}
                  />
                </label>
                <label>
                  <span>Action</span>
                  <button
                    type="button"
                    onClick={addItemToInvoice}
                    className="secondary"
                    disabled={!currentItem.name.trim() || currentItem.quantity <= 0}
                  >
                    Add Item
                  </button>
                </label>
              </div>

              {formData.items.length > 0 && (
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
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
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

            <label className="notes-field">
              <span>Notes</span>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </label>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit">
                {editingInvoice ? "Save Changes" : "Create Invoice"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          onClick={() => toggleSection("unbilled")}
        >
          <h3 style={{ margin: 0 }}>
            Unbilled charges &amp; credits ({visibleUnbilledLines.length})
          </h3>
          <button
            type="button"
            className="collapse-toggle"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection("unbilled");
            }}
            title={sectionVisibility.unbilled ? "Hide section" : "Show section"}
            aria-label={sectionVisibility.unbilled ? "Collapse section" : "Expand section"}
            aria-expanded={sectionVisibility.unbilled}
          >
            <span className="sr-only">
              {sectionVisibility.unbilled ? "Collapse section" : "Expand section"}
            </span>
          </button>
        </div>
        {sectionVisibility.unbilled && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: 0 }}>
              These lines are included when you click <strong>Generate drafts</strong> for each
              client&apos;s closed billing period (per client frequency, team timezone). Credits are
              returns with negative amounts.
              {propertyIdFilter && " Filtered to the selected property."}
            </p>
            {visibleUnbilledLines.length === 0 ? (
              <div className="empty-state">No unbilled charges or credits.</div>
            ) : (
              <>
                <p style={{ fontSize: "14px" }}>
                  Charges {formatCurrency(unbilledTotals.charges)} · Credits{" "}
                  {formatCurrency(unbilledTotals.credits)} · Net {formatCurrency(unbilledTotals.net)}
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table className="inventory-table">
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
                          <td>{line.isCredit ? "Credit" : "Charge"}</td>
                          <td>{line.property?.client?.name || "—"}</td>
                          <td>{line.property?.name || "—"}</td>
                          <td>{line.supplyItem?.name || line.sku?.name || "—"}</td>
                          <td>{Number(line.baseQtyDeployed).toFixed(2)}</td>
                          <td style={{ color: line.isCredit ? "#b91c1c" : undefined }}>
                            {formatCurrency(Number(line.billBackAmount))}
                          </td>
                          <td>{new Date(line.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="panel sold-by-month-panel">
        <div className="sold-by-month-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("soldByMonth")}>
          <h3 style={{ margin: 0 }}>Issued invoices by month · Who received what</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
              <label>
                <span>Year</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  style={{ padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Month</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  style={{ padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {MONTH_NAMES.map((name, index) => (
                    <option key={index + 1} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection("soldByMonth");
              }}
              className="collapse-toggle"
              title={sectionVisibility.soldByMonth ? "Hide section" : "Show section"}
              aria-label={sectionVisibility.soldByMonth ? "Collapse section" : "Expand section"}
              aria-expanded={sectionVisibility.soldByMonth}
            >
              <span className="sr-only">
                {sectionVisibility.soldByMonth ? "Collapse section" : "Expand section"}
              </span>
            </button>
          </div>
        </div>
        {sectionVisibility.soldByMonth && (
          <>
            {soldByMonth.length === 0 ? (
          <div className="empty-state">
            No sent, overdue, or paid invoices in {MONTH_NAMES[selectedMonth - 1]} {selectedYear}. Create or send invoices to see billed items per client here.
          </div>
        ) : (
          <div className="sold-by-month-clients">
            {soldByMonth.map(({ clientId, clientName, invoices: clientInvoices }) => (
              <div key={clientId} className="sold-by-month-client">
                <h4 className="sold-by-month-client-name">{clientName}</h4>
                {clientInvoices.map((inv) => (
                  <div key={inv.id} className="sold-by-month-invoice">
                    <div className="sold-by-month-invoice-meta">
                      <span className="sold-invoice-num">
                        {MONTH_NAMES[(getUtcYearMonth(inv.date)?.month ?? selectedMonth) - 1]}{" "}
                        {getUtcYearMonth(inv.date)?.year ?? selectedYear}
                      </span>
                      <span className="sold-invoice-date">
                        {formatCalendarDate(inv.date)}
                      </span>
                      <span className="sold-invoice-total">{formatCurrency(inv.total)}</span>
                    </div>
                    <table className="inventory-table sold-items-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.items.map((item) => (
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
                ))}
              </div>
            ))}
          </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("activeInvoices")}>
          <h3 style={{ margin: 0 }}>Active Invoices ({invoiceData.active.total})</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection("activeInvoices");
            }}
            className="collapse-toggle"
            title={sectionVisibility.activeInvoices ? "Hide section" : "Show section"}
            aria-label={sectionVisibility.activeInvoices ? "Collapse section" : "Expand section"}
            aria-expanded={sectionVisibility.activeInvoices}
          >
            <span className="sr-only">
              {sectionVisibility.activeInvoices ? "Collapse section" : "Expand section"}
            </span>
          </button>
        </div>
        {sectionVisibility.activeInvoices && (
          <>
            {activeInvoices.length === 0 ? (
          <div className="empty-state">No active invoices. Sent invoices are archived below.</div>
        ) : (
          <>
            <div className="invoices-list">
              {activeInvoices.map((invoice) => renderInvoiceCard(invoice))}
            </div>
            {invoiceData.active.total > invoiceData.active.pageSize && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary"
                  disabled={invoiceData.active.page <= 1 || loadingInvoices}
                  onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pagination-status">
                  Page {invoiceData.active.page} of {invoiceData.active.totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={invoiceData.active.page >= invoiceData.active.totalPages || loadingInvoices}
                  onClick={() => setActivePage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("sentInvoices")}>
          <h3 style={{ margin: 0 }}>Sent Invoices ({invoiceData.sent.total})</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection("sentInvoices");
            }}
            className="collapse-toggle"
            title={sectionVisibility.sentInvoices ? "Hide section" : "Show section"}
            aria-label={sectionVisibility.sentInvoices ? "Collapse section" : "Expand section"}
            aria-expanded={sectionVisibility.sentInvoices}
          >
            <span className="sr-only">
              {sectionVisibility.sentInvoices ? "Collapse section" : "Expand section"}
            </span>
          </button>
        </div>
        {sectionVisibility.sentInvoices && (
          <>
            {sentInvoices.length === 0 ? (
          <div className="empty-state">No sent invoices yet. Invoices will be automatically archived here once sent.</div>
        ) : (
          <>
            <div className="invoices-list">
              {sentInvoices.map((invoice) => renderInvoiceCard(invoice))}
            </div>
            {invoiceData.sent.total > invoiceData.sent.pageSize && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary"
                  disabled={invoiceData.sent.page <= 1 || loadingInvoices}
                  onClick={() => setSentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pagination-status">
                  Page {invoiceData.sent.page} of {invoiceData.sent.totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={invoiceData.sent.page >= invoiceData.sent.totalPages || loadingInvoices}
                  onClick={() => setSentPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
            )}
          </>
        )}
      </section>
    </div>
  );
};

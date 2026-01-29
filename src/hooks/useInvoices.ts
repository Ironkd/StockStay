import { useEffect, useState } from "react";
import { Invoice } from "../types";
import { invoicesApi } from "../services/invoicesApi";

export const useInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await invoicesApi.getAll();
      setInvoices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
      console.error("Error loading invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  const addInvoice = async (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => {
    try {
      setError(null);
      const newInvoice = await invoicesApi.create(invoice);
      setInvoices((prev) => [...prev, newInvoice]);
      return newInvoice;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
      throw err;
    }
  };

  const updateInvoice = async (id: string, invoice: Partial<Omit<Invoice, "id" | "createdAt" | "updatedAt">>) => {
    try {
      setError(null);
      const updatedInvoice = await invoicesApi.update(id, invoice);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? updatedInvoice : inv))
      );
      return updatedInvoice;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invoice");
      throw err;
    }
  };

  const removeInvoice = async (id: string) => {
    try {
      setError(null);
      await invoicesApi.delete(id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
      throw err;
    }
  };

  const getInvoice = (id: string) => {
    return invoices.find((inv) => inv.id === id);
  };

  return {
    invoices,
    loading,
    error,
    addInvoice,
    updateInvoice,
    removeInvoice,
    getInvoice,
    refresh: loadInvoices
  };
};

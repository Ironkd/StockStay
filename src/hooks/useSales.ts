import { useEffect, useState } from "react";
import { Sale } from "../types";
import { salesApi } from "../services/salesApi";

export const useSales = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await salesApi.getAll();
      setSales(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sales");
      console.error("Error loading sales:", err);
    } finally {
      setLoading(false);
    }
  };

  const addSale = async (sale: Omit<Sale, "id" | "createdAt" | "updatedAt">) => {
    try {
      setError(null);
      const response = await salesApi.create(sale);
      setSales((prev) => [...prev, response.sale]);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sale");
      throw err;
    }
  };

  const updateSale = async (id: string, sale: Partial<Omit<Sale, "id" | "createdAt" | "updatedAt">>) => {
    try {
      setError(null);
      const updatedSale = await salesApi.update(id, sale);
      setSales((prev) =>
        prev.map((s) => (s.id === id ? updatedSale : s))
      );
      return updatedSale;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sale");
      throw err;
    }
  };

  const removeSale = async (id: string) => {
    try {
      setError(null);
      await salesApi.delete(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sale");
      throw err;
    }
  };

  const getSale = (id: string) => {
    return sales.find((s) => s.id === id);
  };

  return {
    sales,
    loading,
    error,
    addSale,
    updateSale,
    removeSale,
    getSale,
    refresh: loadSales
  };
};

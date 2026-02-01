import { useEffect, useState } from "react";
import { Warehouse, WarehouseFormValues } from "../types";
import { warehousesApi } from "../services/warehousesApi";

const normalizeWarehouse = (w: Warehouse): Warehouse => ({
  ...w,
  location: w.location ?? "",
});

export const useWarehouses = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWarehouses = async () => {
    try {
      setError(null);
      const data = await warehousesApi.getAll();
      setWarehouses(data.map(normalizeWarehouse));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouses");
      setWarehouses([]);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  const addWarehouse = async (values: WarehouseFormValues) => {
    try {
      setError(null);
      const created = await warehousesApi.create(values);
      setWarehouses((prev) => [...prev, normalizeWarehouse(created)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add warehouse");
      throw err;
    }
  };

  const updateWarehouse = async (id: string, values: WarehouseFormValues) => {
    try {
      setError(null);
      const updated = await warehousesApi.update(id, values);
      setWarehouses((prev) =>
        prev.map((w) => (w.id === id ? normalizeWarehouse(updated) : w))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update warehouse");
      throw err;
    }
  };

  const removeWarehouse = async (id: string) => {
    try {
      setError(null);
      await warehousesApi.delete(id);
      setWarehouses((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete warehouse");
      throw err;
    }
  };

  const getWarehouseById = (id: string | undefined): Warehouse | undefined => {
    if (!id) return undefined;
    return warehouses.find((w) => w.id === id);
  };

  return {
    warehouses,
    isLoaded,
    error,
    addWarehouse,
    updateWarehouse,
    removeWarehouse,
    getWarehouseById,
    refresh: loadWarehouses,
  };
};

import { useEffect, useState } from "react";
import { Warehouse, WarehouseFormValues } from "../types";

const STORAGE_KEY = "inventory-organizer-warehouses-v1";

const createWarehouse = (values: WarehouseFormValues): Warehouse => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...values
  };
};

const parseStoredWarehouses = (raw: unknown): Warehouse[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((warehouse) => {
      try {
        const parsed = warehouse as Warehouse;
        if (
          typeof parsed.id === "string" &&
          typeof parsed.name === "string" &&
          typeof parsed.location === "string"
        ) {
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter((x): x is Warehouse => x !== null);
};

export const useWarehouses = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw);
      setWarehouses(parseStoredWarehouses(parsed));
      setIsLoaded(true);
    } catch {
      // ignore corrupted storage
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Only save to localStorage after initial load to prevent overwriting existing data
    if (isLoaded) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(warehouses));
      } catch {
        // ignore quota errors
      }
    }
  }, [warehouses, isLoaded]);

  const addWarehouse = (values: WarehouseFormValues) => {
    setWarehouses((prev) => [...prev, createWarehouse(values)]);
  };

  const updateWarehouse = (id: string, values: WarehouseFormValues) => {
    setWarehouses((prev) =>
      prev.map((warehouse) =>
        warehouse.id === id
          ? {
              ...warehouse,
              ...values,
              updatedAt: new Date().toISOString()
            }
          : warehouse
      )
    );
  };

  const removeWarehouse = (id: string) => {
    setWarehouses((prev) => prev.filter((warehouse) => warehouse.id !== id));
  };

  const getWarehouseById = (id: string | undefined): Warehouse | undefined => {
    if (!id) return undefined;
    return warehouses.find((w) => w.id === id);
  };

  return {
    warehouses,
    addWarehouse,
    updateWarehouse,
    removeWarehouse,
    getWarehouseById
  };
};

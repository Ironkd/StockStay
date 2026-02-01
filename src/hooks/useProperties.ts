import { useEffect, useState } from "react";
import { Property, PropertyFormValues } from "../types";
import { propertiesApi } from "../services/propertiesApi";

const normalizeProperty = (w: Property): Property => ({
  ...w,
  location: w.location ?? "",
});

export const useProperties = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProperties = async () => {
    try {
      setError(null);
      const data = await propertiesApi.getAll();
      setProperties(data.map(normalizeProperty));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load properties");
      setProperties([]);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    loadProperties();
  }, []);

  const addProperty = async (values: PropertyFormValues) => {
    try {
      setError(null);
      const created = await propertiesApi.create(values);
      setProperties((prev) => [...prev, normalizeProperty(created)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add property");
      throw err;
    }
  };

  const updateProperty = async (id: string, values: PropertyFormValues) => {
    try {
      setError(null);
      const updated = await propertiesApi.update(id, values);
      setProperties((prev) =>
        prev.map((w) => (w.id === id ? normalizeProperty(updated) : w))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update property");
      throw err;
    }
  };

  const removeProperty = async (id: string) => {
    try {
      setError(null);
      await propertiesApi.delete(id);
      setProperties((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete property");
      throw err;
    }
  };

  const getPropertyById = (id: string | undefined): Property | undefined => {
    if (!id) return undefined;
    return properties.find((w) => w.id === id);
  };

  return {
    properties,
    isLoaded,
    error,
    addProperty,
    updateProperty,
    removeProperty,
    getPropertyById,
    refresh: loadProperties,
  };
};

import { useCallback, useEffect, useRef, useState } from "react";
import { Property, PropertyFormValues } from "../types";
import { propertiesApi } from "../services/propertiesApi";
import { clientsApi } from "../services/clientsApi";

const normalizeProperty = (w: Property): Property => ({
  ...w,
  location: w.location ?? "",
});

export const useProperties = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(false);
  const loadRequestGenerationRef = useRef(0);

  const loadProperties = useCallback(async () => {
    const requestGeneration = ++loadRequestGenerationRef.current;

    try {
      if (isMountedRef.current) {
        setError(null);
      }
      const data = await propertiesApi.getAll();

      if (
        !isMountedRef.current ||
        loadRequestGenerationRef.current !== requestGeneration
      ) {
        return;
      }

      setProperties(data.map(normalizeProperty));
    } catch (err) {
      if (
        !isMountedRef.current ||
        loadRequestGenerationRef.current !== requestGeneration
      ) {
        return;
      }

      setError(err instanceof Error ? err.message : "Failed to load properties");
      setProperties([]);
    } finally {
      if (
        isMountedRef.current &&
        loadRequestGenerationRef.current === requestGeneration
      ) {
        setIsLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadProperties();

    return () => {
      isMountedRef.current = false;
      loadRequestGenerationRef.current += 1;
    };
  }, [loadProperties]);

  const addProperty = async (values: PropertyFormValues) => {
    try {
      if (isMountedRef.current) {
        setError(null);
      }
      let clientId = values.clientId || null;
      if (values.newClient?.name && values.newClient?.email) {
        const createdClient = await clientsApi.create({
          name: values.newClient.name,
          email: values.newClient.email,
          phone: "",
          address: "",
          company: "",
          notes: "",
          defaultMarkupPercentage: values.newClient.defaultMarkupPercentage ?? 0,
          billingFrequency: "monthly_eom",
        });
        clientId = createdClient.id;
      }
      const { newClient: _nc, stockedSupplyItems: _stockedItems, ...rest } = values;
      const created = await propertiesApi.create({
        ...rest,
        clientId,
        newClient: undefined,
      });

      if (isMountedRef.current) {
        setProperties((prev) => [...prev, normalizeProperty(created)]);
      }
      return created;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to add property");
      }
      throw err;
    }
  };

  const updateProperty = async (id: string, values: PropertyFormValues) => {
    try {
      if (isMountedRef.current) {
        setError(null);
      }
      let clientId = values.clientId || null;
      if (values.newClient?.name && values.newClient?.email) {
        const createdClient = await clientsApi.create({
          name: values.newClient.name,
          email: values.newClient.email,
          phone: "",
          address: "",
          company: "",
          notes: "",
          defaultMarkupPercentage: values.newClient.defaultMarkupPercentage ?? 0,
          billingFrequency: "monthly_eom",
        });
        clientId = createdClient.id;
      }
      const {
        newClient: _nc,
        stockLocationIds: _sl,
        stockedSupplyItems: _stockedItems,
        ...rest
      } = values;
      const updated = await propertiesApi.update(id, {
        ...rest,
        clientId,
        newClient: undefined,
        stockLocationIds: undefined,
      });

      if (isMountedRef.current) {
        setProperties((prev) =>
          prev.map((w) => (w.id === id ? normalizeProperty(updated) : w))
        );
      }
      return updated;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to update property");
      }
      throw err;
    }
  };

  const removeProperty = async (id: string) => {
    try {
      if (isMountedRef.current) {
        setError(null);
      }
      await propertiesApi.delete(id);

      if (isMountedRef.current) {
        setProperties((prev) => prev.filter((w) => w.id !== id));
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to delete property");
      }
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

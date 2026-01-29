import { useEffect, useState } from "react";
import { Client } from "../types";
import { clientsApi } from "../services/clientsApi";

export const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientsApi.getAll();
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  const addClient = async (client: Omit<Client, "id" | "createdAt" | "updatedAt">) => {
    try {
      setError(null);
      const newClient = await clientsApi.create(client);
      setClients((prev) => [...prev, newClient]);
      return newClient;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add client");
      throw err;
    }
  };

  const updateClient = async (id: string, client: Partial<Omit<Client, "id" | "createdAt" | "updatedAt">>) => {
    try {
      setError(null);
      const updatedClient = await clientsApi.update(id, client);
      setClients((prev) =>
        prev.map((c) => (c.id === id ? updatedClient : c))
      );
      return updatedClient;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update client");
      throw err;
    }
  };

  const removeClient = async (id: string) => {
    try {
      setError(null);
      await clientsApi.delete(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client");
      throw err;
    }
  };

  const getClient = (id: string) => {
    return clients.find((c) => c.id === id);
  };

  return {
    clients,
    loading,
    error,
    addClient,
    updateClient,
    removeClient,
    getClient,
    refresh: loadClients
  };
};

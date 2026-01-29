import { useEffect, useState } from "react";
import { Category, CategoryFormValues } from "../types";

const STORAGE_KEY = "inventory-organizer-categories-v1";

const createCategory = (values: CategoryFormValues): Category => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...values
  };
};

const parseStoredCategories = (raw: unknown): Category[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((category) => {
      try {
        const parsed = category as Category;
        if (
          typeof parsed.id === "string" &&
          typeof parsed.name === "string"
        ) {
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter((x): x is Category => x !== null);
};

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setCategories(parseStoredCategories(parsed));
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch {
      // ignore quota errors
    }
  }, [categories]);

  const addCategory = (values: CategoryFormValues) => {
    setCategories((prev) => [...prev, createCategory(values)]);
  };

  const updateCategory = (id: string, values: CategoryFormValues) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === id
          ? {
              ...category,
              ...values,
              updatedAt: new Date().toISOString()
            }
          : category
      )
    );
  };

  const removeCategory = (id: string) => {
    setCategories((prev) => prev.filter((category) => category.id !== id));
  };

  const getCategoryById = (id: string | undefined): Category | undefined => {
    if (!id) return undefined;
    return categories.find((c) => c.id === id);
  };

  return {
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    getCategoryById
  };
};

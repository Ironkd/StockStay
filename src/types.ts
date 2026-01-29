export type Warehouse = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseFormValues = {
  name: string;
  location: string;
};

export type Category = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CategoryFormValues = {
  name: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  location: string;
  warehouseId?: string;
  quantity: number;
  unit: string;
  reorderPoint: number;
  priceBoughtFor: number;
  markupPercentage: number;
  finalPrice: number;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItemFormValues = {
  name: string;
  sku: string;
  category: string;
  location: string;
  warehouseId?: string;
  quantity: number;
  unit: string;
  reorderPoint: number;
  priceBoughtFor: number;
  markupPercentage: number;
  finalPrice: number;
  tags: string[];
  notes?: string;
};

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string; // Kept for backward compatibility
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  company?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue";
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  // Optional link back to inventory so editing invoices
  // can update stock levels when needed.
  inventoryItemId?: string;
  sku?: string;
};

export type Sale = {
  id: string;
  saleNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type SaleItem = {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

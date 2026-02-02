export type Property = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
};

export type PropertyFormValues = {
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
  propertyId?: string;
  quantity: number;
  unit: string;
  reorderPoint: number;
  reorderQuantity?: number;
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
  propertyId?: string;
  quantity: number;
  unit: string;
  reorderPoint: number;
  reorderQuantity: number;
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

// Invoice email branding (stored per team)
export type InvoiceStyle = {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  primaryColor?: string;
  accentColor?: string;
  footerText?: string;
};

// Team (GET /api/team response)
export type TeamInfo = {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  effectivePlan: string;
  maxProperties: number | null;
  /** Effective property limit for current plan/trial (Pro trial = 10, Starter = 3, free = 1) */
  effectiveMaxProperties?: number;
  /** Starter: 0–2 extra user slots at $5/mo each */
  extraUserSlots?: number;
  /** Effective user limit (null = unlimited; Starter: 3 + extraUserSlots; Free: 1) */
  effectiveMaxUsers?: number | null;
  propertyCount: number;
  billingInterval: string | null;
  isOnTrial: boolean;
  trialEndsAt: string | null;
  trialStatus?: string;
  billingPortalAvailable: boolean;
  /** Invoice email branding */
  invoiceLogoUrl?: string | null;
  invoiceStyle?: InvoiceStyle | null;
};

export type TeamMemberInfo = {
  id: string;
  teamRole: string;
  maxInventoryItems: number | null;
  allowedPages: string[] | null;
  allowedPropertyIds: string[] | null;
  email?: string;
  name?: string;
  isTeammate?: boolean;
};

export type TeamInvitationInfo = {
  id: string;
  email: string;
  teamRole: string;
  maxInventoryItems: number | null;
  status: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  allowedPages: string[] | null;
  allowedPropertyIds: string[] | null;
};

export type TeamData = {
  team: TeamInfo;
  members: TeamMemberInfo[];
  invitations: TeamInvitationInfo[];
};

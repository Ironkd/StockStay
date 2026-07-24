export type Property = {
  id: string;
  name: string;
  location: string;
  clientId?: string | null;
  markupPercentage?: string | number | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyFormValues = {
  name: string;
  location: string;
  clientId?: string | null;
  markupPercentage?: string | number | null;
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

export type BillingFrequency = "weekly" | "biweekly" | "monthly_eom";

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
  defaultMarkupPercentage?: string | number;
  billingFrequency?: BillingFrequency;
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
  organizationId?: string;
  organizationName?: string;
  isOrgOwner?: boolean;
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

export type OrganizationOwnerInfo = {
  id: string;
  name: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type OrganizationInfo = {
  id: string;
  name: string;
  owners: OrganizationOwnerInfo[];
};

export type OrganizationTeamSummary = {
  id: string;
  name: string;
  memberCount?: number;
  isActive?: boolean;
  isMember?: boolean;
  myTeamRole?: string | null;
};

export type TeamData = {
  team: TeamInfo;
  members: TeamMemberInfo[];
  invitations: TeamInvitationInfo[];
  organization?: OrganizationInfo;
  organizationTeams?: OrganizationTeamSummary[];
};

/** Catalogue / stock location (Appendix A #3) */
export type UnitDimension = "count" | "volume" | "mass" | "length" | "other";

export type UnitOfMeasure = {
  id: string;
  code: string;
  name: string;
  dimension: UnitDimension;
  createdAt: string;
  updatedAt: string;
};

export type StockLocationPropertyLink = {
  id: string;
  propertyId: string;
  property?: { id: string; name: string; location: string | null };
};

export type StockLocation = {
  id: string;
  teamId: string;
  name: string;
  address: string | null;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  properties?: StockLocationPropertyLink[];
};

export type StockLocationFormValues = {
  name: string;
  address?: string | null;
  tags?: string[];
};

export type SupplyItem = {
  id: string;
  teamId: string;
  name: string;
  category: string;
  baseUnitId: string;
  defaultReorderPoint: string;
  defaultReorderQuantity: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  baseUnit?: Pick<UnitOfMeasure, "id" | "code" | "name" | "dimension">;
};

export type SupplyItemFormValues = {
  name: string;
  category?: string;
  baseUnitId: string;
  defaultReorderPoint?: number | string;
  defaultReorderQuantity?: number | string;
};

export type StockOnHand = {
  id: string;
  skuId: string;
  quantity: string;
};

export type Sku = {
  id: string;
  teamId: string;
  supplyItemId: string;
  stockLocationId: string;
  name: string;
  supplier: string | null;
  packSize: string;
  purchasePrice: string;
  unitRate: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stockOnHand?: StockOnHand;
  supplyItem?: { id: string; name: string; category: string; baseUnitId: string };
  stockLocation?: { id: string; name: string };
};

export type SkuFormValues = {
  name: string;
  supplyItemId: string;
  stockLocationId: string;
  supplier?: string | null;
  packSize: number | string;
  purchasePrice: number | string;
};

/** Ledger (Appendix A #4) */
export type StockEntityType = "stock_on_hand" | "property_stock";

export type StockTransactionType =
  | "receipt"
  | "adjustment"
  | "replenishment_out"
  | "replenishment_in"
  | "invoice";

export type PropertyStock = {
  id: string;
  teamId: string;
  propertyId: string;
  supplyItemId: string;
  quantity: string;
  reorderPoint: string;
  reorderQuantity: string;
  createdAt: string;
  updatedAt: string;
  property?: { id: string; name: string };
  supplyItem?: { id: string; name: string; category: string; baseUnitId: string };
};

export type StockTransaction = {
  id: string;
  teamId: string;
  entityType: StockEntityType;
  entityId: string;
  quantityDelta: string;
  transactionType: StockTransactionType;
  postingId: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdByUserId: string | null;
  createdAt: string;
};

export type LedgerPostResult = {
  postingId: string;
  transactions: StockTransaction[];
  sku?: Sku;
};

/** Replenishment (Appendix A #5) */
export type ReplenishmentDirection = "replenish" | "return";

export type ReplenishmentLine = {
  id: string;
  replenishmentId: string;
  skuId: string;
  supplyItemId: string;
  baseQtyDeployed: string;
  packQtyConsumed: string;
  unitRate: string;
  markupPercentage: string;
  billBackAmount: string;
  billable: boolean;
  invoiced: boolean;
  reversesLineId: string | null;
  stockPostingId: string | null;
  createdAt: string;
  sku?: { id: string; name: string };
  supplyItem?: { id: string; name: string };
  reversesLine?: { id: string } | null;
  reversedBy?: Array<{ id: string; baseQtyDeployed: string }>;
};

export type Replenishment = {
  id: string;
  teamId: string;
  stockLocationId: string;
  propertyId: string;
  direction: ReplenishmentDirection;
  status: "completed";
  performedByUserId: string | null;
  transferGroupId: string | null;
  createdAt: string;
  lines?: ReplenishmentLine[];
  property?: {
    id: string;
    name: string;
    clientId?: string | null;
    markupPercentage?: string | null;
    client?: {
      id: string;
      name: string;
      defaultMarkupPercentage?: string;
    };
  };
  stockLocation?: { id: string; name: string };
};

export type UnbilledLine = ReplenishmentLine & {
  direction: ReplenishmentDirection;
  property: {
    id: string;
    name: string;
    client?: { id: string; name: string } | null;
  } | null;
  stockLocation?: { id: string; name: string } | null;
  isCredit: boolean;
};

export type CreateReplenishmentInput = {
  stockLocationId: string;
  propertyId: string;
  lines: Array<{ skuId: string; baseQty: number | string }>;
};

export type CreateReturnInput = {
  reversesLineId: string;
  baseQty: number | string;
  stockLocationId?: string;
  skuId?: string;
};

export type CreateTransferInput = {
  fromPropertyId: string;
  toPropertyId: string;
  stockLocationId: string;
  skuId: string;
  baseQty: number | string;
};

export type TransferResult = {
  transferGroupId: string;
  return: Replenishment;
  replenish: Replenishment;
};

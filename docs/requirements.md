# Stock Stay — Requirements & Domain Specification

**Version:** 0.4 (pre-alpha gaps from assessment/strategy incorporated)  
**Status:** Ready for implementation planning (timezone for billing periods still open)  
**Audience:** David (product owner), development agents, QA  
**Last updated:** 2026-07-12

---

## Document purpose

This document is the **source of truth** for Stock Stay's functional requirements. It synthesizes:

1. The **current codebase** (`server/prisma/schema.prisma`, `server/server.js`, frontend pages)
2. The **Phase 1 assessment** (Probable, February 2026)
3. **Product strategy call notes** (stock locations, supply catalogue, monthly client billing)
4. **Validation sessions** with Neil (Probable) and David

Future implementation work — schema changes, API refactors, UI flows — should trace back to sections in this document. Validated decisions are recorded in [Section 11](#11-resolved-decisions). One item remains open: **billing timezone** (Q1b).

---

## 1. Product overview

### 1.1 What Stock Stay is

Stock Stay is an **inventory management tool for short-term rental (STR) property managers**. Property managers purchase consumables centrally (cleaning supplies, coffee pods, toiletries, etc.), hold that stock at a **stock location**, and **replenish properties** as needed. When stock moves from a stock location to a property, the PM **bills the client** associated with that property.

The core value proposition:

- Track what the PM has on hand at central supply locations
- Track what each property has, expressed in practical units (pods, bottles, grams)
- Automatically calculate **client bill-back** when stock is deployed to a property
- Generate **scheduled invoices** for clients and export them for accounting software

### 1.2 Two billing layers (keep distinct)

Stock Stay has two completely separate billing concepts. Documentation, code, and UI must never conflate them.

| Layer | Who pays whom | Mechanism | Status |
|-------|---------------|-----------|--------|
| **SaaS billing** | PM company → Stock Stay | Stripe subscription (Free / Starter / Pro) | Existing; largely unchanged |
| **Client billing** | PM company → Client | Scheduled invoices for replenished stock | Major redesign; simple in v1 |

**Client billing (v1 scope):**

- PM generates draft invoices from accumulated replenishments on each client's billing schedule
- PM reviews, sends by **email (HTML + PDF attachment)**, or **exports CSV**
- PM marks invoices paid/overdue **manually**
- **No** in-app payment collection, **no** client login portal in v1
- **No** ad-hoc invoice at replenishment time (deferred — UX complexity)

### 1.3 Confirmed product decisions

| Topic | Decision |
|-------|----------|
| Client ↔ Property | One client can be billed for **multiple properties**. Each property has **one billing client**. |
| Client identity | **Client** is a billing contact — not assumed to be the property owner. The PM's relationship may be with an owner, manager, or other party. |
| Billing schedule | Per client: **weekly**, **biweekly**, or **monthly (end of month)**. Editable per client. **Timezone for period boundaries: open** — see Q1b. |
| Bill-back pricing | Unit rate × base qty, plus **markup**. Markup is set **per property**, with a **default markup per client**. |
| Invoice grouping | **One invoice per client** per billing period, with line items **broken down by property**. |
| Ad-hoc invoice at replenishment | **Out of scope** for now. |
| Replenishment reversals | Credit applied on the **next invoice** for that client (no separate credit-note document). |
| Inter-property transfer | Always **pass through a stock location**. Each leg is a normal billable/refundable transaction: Property→Location **credits** the source property's client; Location→Property **bills** the destination property's client. |
| Multi-team users | **Schema and UI in v1** (UserMembership + team switching) so the feature can be tested end-to-end. |
| Negative stock | **Hard block** — replenishment (and other outflows) must not leave StockOnHand negative. |
| Data migration | **None.** Service has not launched; replace existing models as needed. |
| Stock location fields | **Name + address + tags** are sufficient. |
| Plan limits | Caps supported for stock locations, supply items, and SKUs (and existing limits). Values are **configurable** and UI/marketing must read the same live config. |
| Invoice delivery | **PDF**, **email HTML**, and **CSV export** are all required in v1. Accounting export = CSV only (QBO/Xero-specific formats deferred). |
| Consumption tracking | **Not in v1**. Billing is driven by stock location ↔ property movements (replenish and return), including legs of inter-property transfers. |
| Break-pack | Replenishment can deploy **partial units** from a sealed SKU (e.g. 20 loose pods from a 100-pack → decrement 0.2 packs at stock location). |
| v1 scope | Include **Organization** model above Team. Client portal, payment gateway, consumption, and ad-hoc replenishment invoicing = deferred. |

---

## 2. Domain terminology

### 2.1 Recommended terms

| Schema name | UI label | Definition |
|-------------|----------|------------|
| **SupplyItem** | Supply Item | Canonical product the PM tracks ("Coffee Pod"). Quantity at properties is expressed in the item's **base unit** (e.g. pods, ml, g). |
| **SKU** | SKU | A specific purchasable package linked to a Supply Item (e.g. "Kirkland Pacific Bold — Pack of 100 @ $48"). Holds pack size, purchase price, and computed **unit rate** ($0.48/pod). |
| **StockLocation** | Stock Location | PM's central supply shelf/warehouse. Holds SKU inventory before replenishment. UI alias: "Central Supply". |
| **Replenishment** | Replenishment | Moving stock from a Stock Location to a Property. **Chargeable event** for client bill-back. Avoid "sale" or "allocation" in UI. |
| **Client** | Client | Billing contact for a property. Not assumed to be the property owner. One client may be billed for multiple properties. |
| **Organization** | Organization | Top-level tenant; Stock Stay subscription billing. |
| **Team** | Team | Operational unit within an organization. |
| **Property** | Property | STR rental unit. |
| **StockTransaction** | — (audit/history) | Immutable ledger entry for any quantity change. Replaces current `InventoryMovement`. |
| **StockOnHand** | — | Quantity of a SKU at a stock location. |
| **PropertyStock** | — | Quantity of a Supply Item at a property (in base units). |
| **Invoice** | Invoice | Bill to client for replenishments. Distinct from SaaS subscription billing. |

### 2.2 Names to retire or avoid

| Current / draft | Issue | Use instead |
|-----------------|-------|-------------|
| Item Type | Clumsy; unclear to PMs | **Supply Item** |
| Master Item | Redundant | **Supply Item** |
| Allocation | Accounting jargon | **Replenishment** |
| Sale | Deprecated; wrong mental model | **Replenishment** + **Invoice** |
| Inventory (as a single concept) | Overloaded | **SupplyItem**, **StockOnHand**, **PropertyStock** |
| InventoryMovement | Implementation detail | **StockTransaction** |

**Keeping as-is:** `Client`, `SKU`.

### 2.3 Unit and pricing vocabulary

| Term | Definition |
|------|------------|
| **Base unit** | Canonical unit for a Supply Item at a property (e.g. `pod`, `ml`, `g`). |
| **Pack size** | Base units per SKU unit (e.g. 100 pods per pack). |
| **Unit rate** | `purchasePrice ÷ packSize` — base cost per base unit (e.g. $48 ÷ 100 = $0.48/pod). |
| **Markup** | Percentage applied on top of unit rate for client bill-back. Set **per property**, defaulting from the **client's default markup**. |
| **Bill-back** | Client charge for a replenishment: `baseQty × unitRate × (1 + effectiveMarkup/100)`. |
| **Break-pack** | Deploying loose base units from a sealed SKU; stock location decrement is fractional (e.g. 20 pods = 0.2 packs). |
| **Billing frequency** | Per-client schedule: `weekly`, `biweekly`, or `monthly_eom` (end of month). |

### 2.4 Units of measure

- Each Supply Item has one **canonical base unit** per measure type (count, mass, volume).
- Prefer SI bases internally (`g`, `ml`, `each`).
- Display localization (lb, fl oz) is a **conversion layer**, not a separate unit type.
- Example: a Supply Item tracked in grams can display as ounces in the UI via conversion factor.

---

## 3. Actors and permissions

### 3.1 Actor diagram

```mermaid
flowchart TB
  subgraph platform [Platform]
    SuperAdmin[StockStaySuperAdmin]
  end
  subgraph org [Organization]
    OrgOwner[OrganizationOwner]
    subgraph team [Team]
      TeamOwner[TeamOwner]
      Member[TeamMember]
      Viewer[TeamViewer]
    end
    Client[Client_BillingContact]
  end
  SuperAdmin -->|support_fix| org
  OrgOwner -->|billing_users| org
  TeamOwner -->|manage| team
  Member -->|scoped_ops| team
  Viewer -->|read_only| team
  Client -->|future_portal| org
```

### 3.2 Actor definitions

#### Stock Stay Super Admin (platform)

| Attribute | Detail |
|-----------|--------|
| **Goals** | Support customers, fix data issues, manage platform health |
| **Authentication** | Separate super-user account; not a normal team member |
| **Status** | **Not implemented** — recommended in Phase 1 assessment |
| **Responsibilities** | View/edit org data on behalf of customers; resolve orphaned records; manage demo environments |

#### Organization Owner

| Attribute | Detail |
|-----------|--------|
| **Goals** | Manage Stock Stay subscription, billing, and org-wide settings |
| **Authentication** | User account with org-level ownership |
| **Status** | **New in target model** — today subscription billing is on `Team` |
| **Responsibilities** | Stripe subscription, plan upgrades, org name, potentially multiple teams |

#### Team Owner

| Attribute | Detail |
|-----------|--------|
| **Goals** | Full control of team operations: properties, stock, clients, invoices, members |
| **Authentication** | User account; `teamRole: "owner"` |
| **Status** | **Existing** — created at signup |
| **Responsibilities** | All pages; create properties; invite members; team settings; invoice branding; start trials |

#### Team Member

| Attribute | Detail |
|-----------|--------|
| **Goals** | Perform day-to-day inventory and billing tasks within granted scope |
| **Authentication** | User account; `teamRole: "member"` |
| **Status** | **Existing** — invited by owner |
| **Responsibilities** | Scoped by `allowedPages` and `allowedPropertyIds`; optional `maxInventoryItems` cap |

#### Team Viewer

| Attribute | Detail |
|-----------|--------|
| **Goals** | Read-only access to team data |
| **Authentication** | User account; `teamRole: "viewer"` |
| **Status** | **Partially implemented** — role exists in Settings UI but **not enforced as read-only on API** |
| **Responsibilities** | View only; no writes (target behavior) |

#### Client (billing contact)

| Attribute | Detail |
|-----------|--------|
| **Goals** | Receive invoices for replenishments to properties they are billed for |
| **Authentication** | **None in v1** — contact record only (name, email, address) |
| **Status** | **Existing** `Client` model |
| **Responsibilities** | N/A — passive recipient of invoices sent by PM |

### 3.3 Permission dimensions

Permissions today (carried forward, extended for new pages):

| Dimension | Applies to | Behavior |
|-----------|------------|----------|
| `teamRole` | Users | `owner` = full access; `member` / `viewer` = restricted |
| `allowedPages` | Members, viewers | JSON array of page keys; empty = no access except home |
| `allowedPropertyIds` | Members, viewers | JSON array; empty = all team properties |
| `maxInventoryItems` | Members | Cap on items member can create (Free plan: 30 default) |
| Plan tier | Team / Org | Free / Starter / Pro gates on properties, users, features |

**Page keys (current + proposed):**

| Page key | Route | Status |
|----------|-------|--------|
| `home` | `/dashboard` | Existing; always allowed |
| `inventory` | `/inventory` | Existing; will expand to stock locations + catalogue |
| `shopping-list` | `/shopping-list` | Existing; Pro only |
| `clients` | `/clients` | Existing |
| `invoices` | `/invoices` | Existing |
| `reports` | `/reports` | Existing |
| `settings` | `/settings` | Existing |
| `stock-locations` | TBD | **New** — manage central supply |
| `catalogue` | TBD | **New** — supply items and SKUs |

### 3.4 Role × operation matrix

Legend: ✅ Allowed · 🔒 Owner only · 🔐 Scoped · 👁 Read only · ❌ Not allowed · 🆕 New

| Operation | Team Owner | Team Member | Team Viewer | Super Admin |
|-----------|------------|-------------|-------------|-------------|
| View dashboard | ✅ | ✅ | 👁 | ✅ |
| Manage supply catalogue | ✅ | 🔐 | 👁 | ✅ |
| Manage stock locations | ✅ | 🔐 | 👁 | ✅ |
| Receive stock at location | ✅ | 🔐 | 👁 | ✅ |
| Replenish property | ✅ | 🔐 | 👁 | ✅ |
| Manage properties | ✅ | 🔐 | 👁 | ✅ |
| Manage clients | ✅ | 🔐 | 👁 | ✅ |
| View/create/edit invoices | ✅ | 🔐 | 👁 | ✅ |
| Send invoice email | ✅ | 🔐 | 👁 | ✅ |
| Export invoices | ✅ | 🔐 | 👁 | ✅ |
| View reports | ✅ | 🔐 | 👁 | ✅ |
| Shopping list (Pro) | ✅ | 🔐 | 👁 | ✅ |
| Invite/manage members | 🔒 | ❌ | ❌ | ✅ |
| SaaS billing / plan | 🔒 | ❌ | ❌ | ✅ |
| Invoice branding | 🔒 | ❌ | ❌ | ✅ |
| Org settings | 🆕 🔒 | ❌ | ❌ | ✅ |

**Known gaps (must fix in implementation):**

1. **Viewer role** — stored in UI but write endpoints do not enforce read-only.
2. **Property update/delete** — not owner-only today; any authenticated member with route access can modify.
3. **Super admin** — no platform role or support interface exists.

### 3.5 SaaS plan limits

| Plan | Properties | Users | Inventory items | Notable features |
|------|------------|-------|-----------------|------------------|
| Free | 1 | 1 | 30 | Basic tracking |
| Starter | 3 | 3 (+2 extra @ $5/mo) | Unlimited | Invoices, exports, low-stock alerts |
| Pro | 10 | 5 (+3 extra @ $5/mo) | Unlimited | Shopping list, advanced reports, team permissions |

**Configurable caps (required):** Plan limits must also support caps for **stock locations**, **supply items**, and **SKUs** per tier. Limit values live in a **single configuration source** (e.g. `trialManager.js` / shared plan config). The **UI and marketing pages must read this config live** so published limits never diverge from what the product enforces. Super admins / developers can change values to experiment with pricing without updating marketing copy separately.

---

## 4. Domain model (target state)

### 4.1 Entity relationship diagram

```mermaid
erDiagram
  Organization ||--o{ Team : has
  Organization ||--o{ UserMembership : has
  Team ||--o{ StockLocation : has
  Team ||--o{ Property : manages
  Team ||--o{ Client : has
  Client ||--o{ Property : billed_for
  StockLocation }o--o{ Property : supplies
  SupplyItem ||--o{ PropertyStock : tracks_at_property
  SKU ||--o{ StockOnHand : stocked_at
  SKU }o--|| SupplyItem : sku_of
  UnitOfMeasure ||--o{ SupplyItem : base_unit
  Replenishment ||--|| StockLocation : from
  Replenishment ||--|| Property : to
  Replenishment ||--o{ ReplenishmentLine : contains
  ReplenishmentLine ||--|| SKU : uses
  Invoice ||--o{ InvoiceLine : contains
  Invoice ||--|| Client : billed_to
  InvoiceLine }o--o| ReplenishmentLine : sourced_from
  StockTransaction ||--|| StockOnHand : or_PropertyStock
```

### 4.2 Entity definitions

#### Organization

Top-level tenant. Owns Stock Stay subscription (Stripe). Contains one or more Teams.

| Field (conceptual) | Notes |
|--------------------|-------|
| name | Display name |
| stripeCustomerId | Moved from Team in target model |
| stripeSubscriptionId | Active subscription |
| plan | free / starter / pro |
| invoiceLogoUrl, invoiceStyle | Client invoice branding (**one brand per org**) |

#### Team

Operational unit within an Organization. Today Team is the de facto tenant; target model nests it under Organization.

| Field (conceptual) | Notes |
|--------------------|-------|
| organizationId | FK to Organization |
| name | Team display name |
| timezone | **TBD** — billing-period timezone policy is open (Q1b). Do not implement signup timezone capture until decided. |

#### UserMembership

Join table: User ↔ Team with role and scoping fields. Enables users in multiple teams. **Schema and team-switching UI ship in v1.**

| Field (conceptual) | Notes |
|--------------------|-------|
| userId, teamId | Composite unique |
| teamRole | owner / member / viewer |
| allowedPages, allowedPropertyIds, maxInventoryItems | Same semantics as today |

#### StockLocation

PM's central supply point. Holds SKU inventory before replenishment. Fields are intentionally minimal: **name, address, tags** only.

| Field (conceptual) | Notes |
|--------------------|-------|
| teamId | Owning team |
| name, address | Display / location |
| tags | JSON array for arbitrary grouping (region, route, etc.) |

**Relationships:**

- Many-to-many with Property (a location can supply many properties; a property can be supplied by many locations).

#### SupplyItem

Canonical product concept. Tracked at properties in **base units**.

| Field (conceptual) | Notes |
|--------------------|-------|
| teamId | Owning team |
| name | e.g. "Coffee Pod" |
| category | Server-side (replace localStorage categories) |
| baseUnitId | FK to UnitOfMeasure |
| defaultReorderPoint, defaultReorderQuantity | Defaults for new properties |

#### SKU

Purchasable package variant linked to a Supply Item. Stock is held at Stock Locations at the **pack level**; replenishment may break packs.

| Field (conceptual) | Notes |
|--------------------|-------|
| supplyItemId | FK to SupplyItem |
| stockLocationId | FK to StockLocation (SKU is location-specific) |
| name | e.g. "Kirkland Pacific Bold" |
| supplier | Optional (Costco, Amazon, etc.) |
| packSize | Base units per pack (e.g. 100) |
| purchasePrice | Cost per pack |
| unitRate | Computed: purchasePrice / packSize |

#### StockOnHand

Current quantity of a SKU at a stock location (in **pack units**, may be fractional after break-pack).

#### PropertyStock

Current quantity of a Supply Item at a property (in **base units**).

#### Replenishment

Header record for a stock location → property transfer.

| Field (conceptual) | Notes |
|--------------------|-------|
| stockLocationId, propertyId | Source and destination |
| performedByUserId | Audit |
| createdAt | Timestamp |
| status | completed / reversed |

#### ReplenishmentLine

Line item within a replenishment.

| Field (conceptual) | Notes |
|--------------------|-------|
| replenishmentId | FK |
| skuId | Which SKU was pulled |
| supplyItemId | Denormalized for queries |
| baseQtyDeployed | e.g. 20 pods |
| packQtyConsumed | e.g. 0.2 packs |
| unitRate | Rate at time of replenishment |
| markupPercentage | Effective markup snapshot at time of replenishment |
| billBackAmount | `baseQty × unitRate × (1 + markupPercentage/100)` |
| billable | Default true |
| invoiced | false until included in an Invoice |

#### StockTransaction

Immutable ledger entry. **Every** quantity change creates one row. No direct edits to StockOnHand or PropertyStock balances.

| Field (conceptual) | Notes |
|--------------------|-------|
| teamId | Tenant scope |
| entityType | stock_on_hand / property_stock |
| entityId | FK to the balance record |
| quantityDelta | Signed; base units for property stock, pack units for stock on hand |
| transactionType | receipt / adjustment / replenishment_out / replenishment_in / transfer / invoice |
| referenceType, referenceId | Link to Replenishment, Invoice, etc. |

#### Client

Billing contact. Unchanged conceptually from today, with new billing-schedule and markup fields.

| Field (conceptual) | Notes |
|--------------------|-------|
| teamId | Owning team |
| name, email, phone, address fields | Contact info |
| billingFrequency | `weekly` \| `biweekly` \| `monthly_eom` — editable per client |
| defaultMarkupPercentage | Default markup applied to properties billed to this client (properties may override) |

#### Property

STR rental unit.

| Field (conceptual) | Notes |
|--------------------|-------|
| teamId | Owning team |
| clientId | Default billing client |
| markupPercentage | Optional override; if null, use `Client.defaultMarkupPercentage` |
| name, location | Existing fields |

#### Invoice / InvoiceLine

Client invoice. Target model normalizes line items (today lines are JSON blobs). One invoice per client per billing period; lines grouped/broken down by property.

| Field (conceptual) | Notes |
|--------------------|-------|
| clientId | Billed client |
| billingPeriodStart, billingPeriodEnd | Period covered (timezone policy TBD — Q1b) |
| status | draft / sent / paid / overdue |
| lines | FK to InvoiceLine rows |
| InvoiceLine.propertyId | Property breakdown within the client invoice |
| InvoiceLine.replenishmentLineId | Traceability to source replenishment (or credit from reverse) |

### 4.3 Key modeling rules

1. **Client ↔ Property:** Each property has one billing client (`Property.clientId`). Client is not assumed to be the property owner.

2. **Stock Location ↔ Property:** Many-to-many. Tags on stock locations enable arbitrary grouping and filtered views ("all locations for Property X", "all properties for Location Y").

3. **SKU ↔ Supply Item:** Multiple SKUs can map to one Supply Item (equivalent products). SKUs are scoped to a stock location.

4. **Break-pack replenishment:**
   - User enters quantity in **base units** (e.g. 20 pods).
   - Property stock increment: `+20 pods`.
   - Stock location decrement: `-20/100 = -0.2 packs`.

5. **Bill-back calculation:**
   ```
   unitRate = sku.purchasePrice / sku.packSize
   effectiveMarkup = property.markupPercentage ?? client.defaultMarkupPercentage ?? 0
   billBackAmount = baseQtyDeployed × unitRate × (1 + effectiveMarkup / 100)
   ```

6. **No negative stock:** Outflows (replenishment, transfer out of location) are **hard-blocked** if StockOnHand would go below zero.

7. **Inter-property transfer via stock location:** There is no direct property↔property stock move. Transfers are two ledger legs, each following the normal billing rules:
   - **Property A → Stock Location** = return (credit / refund to Property A's billing client)
   - **Stock Location → Property B** = replenishment (bill Property B's billing client)
   - If the source property is linked to multiple stock locations, the user **must choose** which location the item passes through (and which SKU when converting into location stock).

8. **Ledger integrity:** Quantity balances are updated **only** via StockTransaction posting. No route may update `StockOnHand.quantity` or `PropertyStock.quantity` directly.

9. **Deletion policy:** Entities with transaction or invoice history are **archived**, not hard-deleted. (Greenfield: no legacy data migration required.)

10. **Organization + UserMembership:** Users may belong to multiple teams; v1 includes schema **and** UI for switching active team.

---

## 5. Operations catalogue

Each operation is documented with: **preconditions**, **steps**, **postconditions**, **audit trail**, **billing side-effects**.

### 5.1 Stock Location operations

#### SL-1: Create stock location

| | |
|---|---|
| **Actor** | Team Owner (Member if granted settings/stock-locations page) |
| **Preconditions** | User authenticated; team exists; within plan limits (if capped) |
| **Steps** | Enter name, optional address, optional tags → save |
| **Postconditions** | StockLocation record created |
| **Audit** | Created timestamp, createdBy user |
| **Billing** | None |

#### SL-2: Edit / archive stock location

| | |
|---|---|
| **Preconditions** | Location belongs to user's team |
| **Steps** | Update fields or set archived flag |
| **Postconditions** | Location updated; archived locations hidden from default views but history preserved |
| **Audit** | Updated timestamp |
| **Billing** | None |

#### SL-3: Link properties to stock location

| | |
|---|---|
| **Preconditions** | Location and properties belong to same team |
| **Steps** | Select properties to supply from this location |
| **Postconditions** | Many-to-many link created |
| **Audit** | Link change logged |
| **Billing** | None |

#### SL-4: Receive stock (purchase)

| | |
|---|---|
| **Preconditions** | SKU exists at location; user has stock access |
| **Steps** | Select SKU → enter pack quantity received → confirm |
| **Postconditions** | StockOnHand incremented; StockTransaction (type: receipt) created |
| **Audit** | StockTransaction with positive delta |
| **Billing** | None — receiving stock is not billable to client |

#### SL-5: Adjust stock at location

| | |
|---|---|
| **Preconditions** | SKU exists; user has access |
| **Steps** | Enter adjustment quantity (+/−) and reason code |
| **Postconditions** | StockOnHand updated via StockTransaction (type: adjustment) |
| **Audit** | StockTransaction with reason |
| **Billing** | None |

#### SL-6: View stock levels / low-stock alerts

| | |
|---|---|
| **Preconditions** | User has inventory or stock-locations page access |
| **Steps** | Browse locations; filter by tag; view SKUs below reorder point |
| **Postconditions** | Read-only display |
| **Audit** | None |
| **Billing** | None |

---

### 5.2 Catalogue operations

#### CAT-1: Create supply item

| | |
|---|---|
| **Actor** | Team Owner or Member with catalogue access |
| **Preconditions** | User authenticated; within plan limits |
| **Steps** | Enter name, category, base unit, optional default reorder values → save |
| **Postconditions** | SupplyItem record created |
| **Audit** | Created timestamp |
| **Billing** | None |

#### CAT-2: Add SKU to supply item

| | |
|---|---|
| **Preconditions** | Supply Item exists; Stock Location selected |
| **Steps** | Enter SKU name, supplier, pack size, purchase price → system computes unit rate → save |
| **Postconditions** | SKU record created; StockOnHand initialized at 0 |
| **Audit** | Created timestamp |
| **Billing** | None |

**Example:**

| Field | SKU A | SKU B |
|-------|-------|-------|
| Name | Kirkland Pacific Bold | Solimo Medium Roast |
| Pack size | 100 pods | 80 pods |
| Purchase price | $48.00 | $32.00 |
| Unit rate (computed) | $0.48/pod | $0.40/pod |

#### CAT-3: Edit / archive supply item or SKU

| | |
|---|---|
| **Preconditions** | Entity belongs to team; no blocking dependencies (or archive instead of delete) |
| **Steps** | Update fields or archive |
| **Postconditions** | Entity updated/archived; historical replenishments retain snapshot values |
| **Audit** | Updated timestamp |
| **Billing** | None |

#### CAT-4: Map multiple SKUs to one supply item

| | |
|---|---|
| **Preconditions** | Supply Item exists |
| **Steps** | Create additional SKUs with same supplyItemId at same or different locations |
| **Postconditions** | Replenishment workflow can choose any linked SKU |
| **Audit** | None |
| **Billing** | Bill-back uses the **actual SKU's unit rate** at time of replenishment |

---

### 5.3 Property operations

#### PROP-1: Create / edit property

| | |
|---|---|
| **Actor** | Team Owner (create); Owner or Member (edit — tighten to owner-only in target) |
| **Preconditions** | Within plan property limit |
| **Steps** | Enter name, location, assign billing client, link stock locations |
| **Postconditions** | Property record with clientId and location links |
| **Audit** | Created/updated timestamp |
| **Billing** | clientId determines scheduled invoice target |

#### PROP-2: View property stock

| | |
|---|---|
| **Preconditions** | User has access to property (allowedPropertyIds check) |
| **Steps** | Select property → view supply items with quantities in base units |
| **Postconditions** | Read-only display; low-stock indicators |
| **Audit** | None |
| **Billing** | None |

#### PROP-3: Set reorder points per property

| | |
|---|---|
| **Preconditions** | Supply Item exists at property |
| **Steps** | Set reorderPoint and reorderQuantity for PropertyStock |
| **Postconditions** | Low-stock alerts and shopping list reflect new thresholds |
| **Audit** | Updated timestamp |
| **Billing** | None |

---

### 5.4 Replenishment operations (core workflow)

#### REP-1: Create replenishment

| | |
|---|---|
| **Actor** | Team Owner or Member with inventory access |
| **Preconditions** | Property and stock location linked; SKU has **sufficient StockOnHand** (hard block if insufficient) |
| **Steps** | See [Section 5b UI walkthrough](#5b-end-to-end-ui-walkthrough) |
| **Postconditions** | Replenishment + lines created; StockOnHand decremented; PropertyStock incremented; bill-back recorded as unbilled |
| **Audit** | StockTransaction rows (replenishment_out at location, replenishment_in at property) |
| **Billing** | ReplenishmentLine.billBackAmount queued for next invoice on client's schedule |

#### REP-2: Reverse replenishment (property → stock location)

| | |
|---|---|
| **Preconditions** | Original replenishment exists; property has sufficient PropertyStock |
| **Steps** | Initiate return → specify base qty → confirm |
| **Postconditions** | Opposite stock movements; credit recorded as unbilled negative line |
| **Audit** | StockTransaction rows |
| **Billing** | Credit applied on the **next invoice** for that client (no separate credit-note document) |

#### REP-3: Inter-property transfer (via stock location)

| | |
|---|---|
| **Actor** | Team Owner or Member with inventory access |
| **Preconditions** | Both properties in same team; at least one stock location for the pass-through; sufficient PropertyStock at source; after first leg, sufficient StockOnHand for second leg (hard block if not) |
| **Steps** | Select source property, destination property, supply item, quantity, and **pass-through stock location** (required if multiple). Select SKU when converting into/out of location stock. System posts two normal transactions in sequence. |
| **Postconditions** | Two ledger legs: (1) Property A → Stock Location (return), (2) Stock Location → Property B (replenishment). No direct property↔property quantity change. |
| **Audit** | Same StockTransaction types as a standalone return + standalone replenishment, preferably linked by a shared transfer reference ID |
| **Billing** | **Leg 1 credits** Property A's client (queued for next invoice). **Leg 2 bills** Property B's client (queued for next invoice). Same markup rules as ordinary return/replenish. |

---

### 5.5 Client billing operations

#### BILL-1: Generate scheduled draft invoices

| | |
|---|---|
| **Actor** | System (scheduled job) or Team Owner / Member with invoices access (manual trigger) |
| **Preconditions** | Unbilled replenishment lines (and reverse credits) exist for clients whose billing period has ended (per `Client.billingFrequency`; timezone per Q1b) |
| **Steps** | For each due client: aggregate unbilled lines → create **one draft Invoice** with lines **grouped/broken down by property** |
| **Postconditions** | Invoice in draft status; lines linked to replenishment lines; replenishment lines marked invoiced |
| **Audit** | Invoice created timestamp |
| **Billing** | This **is** the billing operation |

#### BILL-2: Review and edit draft invoice

| | |
|---|---|
| **Preconditions** | Invoice in draft status |
| **Steps** | PM adjusts line items, tax, notes |
| **Postconditions** | Invoice updated |
| **Audit** | Updated timestamp |
| **Billing** | Totals recalculated |

#### BILL-3: Send invoice to client

| | |
|---|---|
| **Preconditions** | Invoice has client email; invoice in draft or sent status |
| **Steps** | PM clicks Send → email dispatched with branded **HTML body** and **PDF attachment** |
| **Postconditions** | Invoice status → sent |
| **Audit** | Sent timestamp |
| **Billing** | None (delivery only) |

#### BILL-4: Export invoice(s) as CSV

| | |
|---|---|
| **Preconditions** | Invoice exists |
| **Steps** | PM exports invoice or batch as **CSV** → download (sufficient for accounting import in v1) |
| **Postconditions** | CSV file generated |
| **Audit** | Export logged (optional) |
| **Billing** | None |

#### BILL-5: Mark invoice paid / overdue

| | |
|---|---|
| **Preconditions** | Invoice in sent status |
| **Steps** | PM manually updates status |
| **Postconditions** | Invoice status updated |
| **Audit** | Status change timestamp |
| **Billing** | None — no payment processing in v1 |

#### BILL-6: Configure client billing frequency and markup

| | |
|---|---|
| **Preconditions** | Client exists; user has clients access |
| **Steps** | Set `billingFrequency` (weekly / biweekly / monthly_eom) and `defaultMarkupPercentage`; optionally set per-property `markupPercentage` overrides |
| **Postconditions** | Future invoices and bill-backs use new settings (does not rewrite past invoices) |
| **Audit** | Updated timestamp |
| **Billing** | Affects subsequent bill-back amounts and schedule |

---

### 5.6 Organization and team operations

| Operation | Status | Notes |
|-----------|--------|-------|
| Signup / login / email verification | Existing | Streamline: ask for less data; **do not require payment to sign up** (Strategy Phase 2) |
| Invite team members | Existing | Extend for viewer enforcement |
| Stripe SaaS checkout / portal | Existing | Move to Organization level |
| Start trial (Starter / Pro) | Existing | 14-day trials |
| Plan upgrade / downgrade | **Modify** | Define behaviour when limits shrink (excess properties/users/locations) — see BR-20 |
| Invoice branding (logo, colors) | Existing | May move to org level |
| Create organization | **New** | On signup or first login |
| Manage teams under org | **New** | Schema + UI in v1 |
| Multi-team user switching | **New** | Schema + UI in v1 (UserMembership) |

---

## 5b. End-to-end UI walkthrough

This section is the canonical example for validation. All implementation of catalogue, replenishment, and bill-back must support this flow.

### Phase 1: Setting up the catalogue

1. PM navigates to **Catalogue** and creates a Supply Item: **"Coffee Pod"** (base unit: **pod**).
2. PM adds **SKU A** under Coffee Pod at Central Supply stock location:
   - Name: Kirkland Pacific Bold
   - Purchase price: $48.00
   - Pack size: 100
   - System displays unit rate: **$0.48 / pod**
3. PM adds **SKU B**:
   - Name: Solimo Medium Roast
   - Purchase price: $32.00
   - Pack size: 80
   - System displays unit rate: **$0.40 / pod**

### Phase 2: Replenishing a property

1. PM sees **Property A** is low on Coffee Pods (PropertyStock below reorder point).
2. PM starts a **Replenishment**. App asks: *"Which stock location are you pulling from?"*
3. PM selects **Central Supply** and chooses **SKU A (Kirkland)** from the shelf.
4. PM enters **20 pods** to deploy to Property A.
5. System automatically:
   - Decrements **0.2 packs** from Central Supply StockOnHand (20 ÷ 100)
   - Adds **20 pods** to Property A PropertyStock for Coffee Pod
   - Records bill-back: $0.48 × 20 = **$9.60** on ReplenishmentLine (status: unbilled)

### Phase 3: Scheduled client billing

1. When the client's billing period ends (weekly / biweekly / monthly EOM; **timezone TBD — Q1b**), the billing engine aggregates all unbilled replenishment lines (and reverse credits) for that client.
2. System creates **one draft Invoice** for the client, with line items **broken down by property** (including the $9.60 Coffee Pod line under Property A, with markup applied if configured).
3. PM reviews, optionally edits, then **sends by email** (HTML + **PDF attachment**) and/or **exports CSV**.
4. PM marks invoice **paid** when client pays offline.

### Workflow diagram

```mermaid
sequenceDiagram
  participant PM as PropertyManager
  participant SL as StockLocation
  participant Prop as Property
  participant Ledger as StockTransaction
  participant Bill as BillingEngine
  participant Client as Client

  PM->>SL: Receive stock (SKU)
  SL->>Ledger: Record receipt
  PM->>Prop: Start Replenishment
  PM->>SL: Select SKU, enter 20 pods
  SL->>Ledger: Decrement 0.2 packs
  Prop->>Ledger: Increment 20 pods
  Ledger->>Bill: Record bill-back $9.60
  Note over Bill: Client billing period ends
  Bill->>Bill: Aggregate unbilled replenishments per Client
  Bill->>Client: Create draft Invoice broken down by property
  PM->>Client: Review, send PDF email or export CSV
```

### Contrast with today

```mermaid
flowchart LR
  subgraph today [Today]
    Buy[PM buys stock] --> AddProp[Add directly to Property inventory]
    AddProp --> ManualBill[Manual bill-to-client on subtract]
  end
  subgraph target [Target]
    Buy2[PM buys stock] --> Receive[Receive SKU at Stock Location]
    Receive --> Replenish[Replenish Property in base units]
    Replenish --> Scheduled[Scheduled invoice per Client]
    Scheduled --> Export[Email PDF HTML and CSV export]
  end
```

---

## 6. Current state → target state mapping

**Note:** The service has not launched. Existing models may be **replaced**; no production data migration is required.

| Capability | Today | Target | Notes |
|------------|-------|--------|-------|
| Stock storage | `Inventory` rows per Property only | Stock Location stock (SKU) + Property stock (Supply Item) | Replace `Inventory` model |
| Product catalogue | name + sku duplicated per property row | SupplyItem + SKU catalogue | Greenfield replacement |
| Transfers | Property ↔ Property only (`POST /api/inventory/transfer`) | Replenishment + return via stock location; inter-property = return then replenish (both billable) | New transaction types |
| Billing trigger | Manual "bill to client" on subtract/add (`BillToClientModal`) | Location→Property bills; Property→Location credits; scheduled invoices per client | Remove subtract→invoice path |
| Client link | Manual client pick at invoice time | Property has default billing client; invoice schedule/markup on client | Add `Property.clientId`, client billing fields |
| Invoice lines | JSON blob on Invoice | Normalized InvoiceLine with property breakdown + FK to ReplenishmentLine | Replace JSON approach |
| Invoice delivery | Email HTML | Email HTML + **PDF** + **CSV export** | New PDF generation |
| Ledger | InventoryMovement; direct quantity edits allowed | StockTransaction; all changes via ledger service | Refactor all mutation paths |
| Categories | Browser localStorage (`useCategories.ts`) | Server-side, team-scoped | Replace localStorage |
| Sale model | Deprecated API, no UI (`/sales` redirects) | Remove | Replace with Replenishment + Invoice |
| Organization | Team is top-level tenant | Organization → Teams | New entity; move Stripe fields **and** invoice branding |
| User ↔ Team | Single teamId on User | UserMembership join table | Replace single-team link |
| Timezone | Not captured | Billing-period timezone policy **open (Q1b)** | Decide before scheduled billing engine |
| Plan limits | Hardcoded Free/Starter/Pro | Configurable caps including stock locations, supply items, SKUs; UI reads live | Extend plan config |
| Plan downgrade | Soft / unclear | Explicit rules when usage exceeds new plan limits | See BR-20 |
| Demo accounts | Present in codebase | **Remove** demo login path; onboard real users; no shared prod demo | Strategy Phase 2 |
| Signup | May require payment / heavy form | Streamlined; payment not required to start | Strategy Phase 2 |
| Client payment | N/A | Explicitly out of scope v1 | — |
| Viewer role | UI label only | Enforced read-only on API | Add middleware checks |
| Super admin | None | Platform support interface | New feature |
| Decimal types | Float for quantity and money | Decimal | Schema change |

---

## 7. Business rules

Rules that implementation must not guess:

| Rule | Detail |
|------|--------|
| **BR-1 Billable events** | **Location → Property** (replenishment) **bills** the property's client. **Property → Location** (return) **credits** the property's client. Receipt into a stock location from purchase, and stock adjustments, are not client-billable. |
| **BR-2 Bill-back pricing** | `billBackAmount = baseQtyDeployed × unitRate × (1 + effectiveMarkup/100)` where `unitRate = purchasePrice / packSize` and `effectiveMarkup = property.markupPercentage ?? client.defaultMarkupPercentage ?? 0`. Credits use the same formula against the **source** property's effective markup and the SKU unit rate used for the return leg. |
| **BR-3 Break-pack math** | Stock location decrement (packs) = `baseQtyDeployed / sku.packSize`. Fractional packs allowed. |
| **BR-4 Property stock increment** | Always in base units of the Supply Item. |
| **BR-5 Unit rate snapshot** | ReplenishmentLine / credit lines store unit rate and effective markup at time of transaction (later price/markup changes do not alter past lines). |
| **BR-6 Unbilled carry-forward** | Unbilled replenishment charges and return credits carry forward until included in an invoice. No double-billing. |
| **BR-7 Billing schedule** | Per client: `weekly`, `biweekly`, or `monthly_eom`. Timezone for period boundaries is **open (Q1b)** — do not hard-code team-owner-at-signup until decided. |
| **BR-8 Invoice grouping** | One invoice per client per billing period; line items broken down by property. |
| **BR-9 Ledger-only mutations** | No API route or UI action may update stock balances without creating a StockTransaction. |
| **BR-10 No delete with history** | Entities referenced by StockTransaction or InvoiceLine are archived, not hard-deleted. |
| **BR-11 Decimal precision** | Use Decimal type for money and quantities in schema and ledger math. |
| **BR-12 Tenant isolation** | All queries scoped by teamId (via organization). Property-level scoping for members via allowedPropertyIds. |
| **BR-13 Client not owner** | UI and docs must not assume Client is the property owner. Property.clientId is a billing assignment. |
| **BR-14 No negative stock** | Hard block any outflow that would make StockOnHand negative. |
| **BR-15 Return credits** | Credits from Property→Location appear on the **next** invoice for that client; no separate credit-note document in v1. |
| **BR-16 Inter-property via location** | Property↔property moves must pass through a chosen stock location as **two ordinary transactions** (return then replenish). Both legs are billable/refundable under BR-1. Prefer a shared transfer reference ID linking the two legs for audit. |
| **BR-17 Live plan limits** | Cap values (including stock locations, supply items, SKUs) are configurable; product UI and marketing pages read the same live configuration. |
| **BR-18 Invoice artifacts** | Sending an invoice requires PDF + email HTML; CSV export is available separately. |
| **BR-19 Multi-team** | Users may belong to multiple teams; v1 ships membership schema and team-switching UI. |
| **BR-20 Plan downgrade** | When an org/team moves to a lower plan (or trial ends) and current usage exceeds new limits: block creating *new* over-limit resources; existing excess resources remain readable/editable but creation is gated until usage is within limits (or user upgrades). Exact UX copy TBD; never silently delete customer data. |
| **BR-21 Concurrent stock posts** | Ledger posts that change StockOnHand or PropertyStock must use row-level locking (or equivalent serializable transaction) so two concurrent replenishments cannot both pass the sufficiency check. |
| **BR-22 Schema integrity** | Prefer DB enums for fixed vocabularies; unique constraints where business identity requires them (e.g. `@@unique([teamId, invoiceNumber])`); formal Prisma relations + explicit `onDelete` for all FKs. |
| **BR-23 Signup** | New users can sign up and start without completing payment. Collect minimal required fields only. |

---

## 8. User stories

Format: `As a [actor], I want [action], so that [outcome]`.

Tags: `[existing]` · `[modify]` · `[new]` · `[remove]`

### E1: Organization and access

| ID | Story | Tag |
|----|-------|-----|
| E1-1 | As a new user, I want to sign up with minimal data and without paying first, so that I can try Stock Stay quickly. | `[modify]` |
| E1-2 | As an org owner, I want to manage my Stock Stay subscription, so that I can upgrade/downgrade plans. | `[existing]` |
| E1-3 | As a team owner, I want to invite members with specific page and property access, so that staff see only what they need. | `[existing]` |
| E1-4 | As a team owner, I want to assign viewer role that is read-only, so that auditors can see data without changing it. | `[modify]` |
| E1-5 | As a team owner, I want to create teams under my organization, so that regional offices operate independently. | `[new]` |
| E1-6 | As a user, I want to belong to multiple teams and switch between them in the UI, so that larger companies can structure access correctly. | `[new]` |
| E1-7 | As a super admin, I want to view and fix customer data, so that I can provide support. | `[new]` |
| E1-8 | As a user, I want email verification and password reset, so that my account is secure. | `[existing]` |
| E1-9 | As an org owner who downgrades, I want existing data preserved while new creates are blocked when over limit, so that I don't lose work. | `[new]` |
| E1-10 | As a user, I want an easy way to send feedback or report a bug from the app, so that the team can improve Stock Stay. | `[new]` |

### E2: Stock locations and supply catalogue

| ID | Story | Tag |
|----|-------|-----|
| E2-1 | As a PM, I want to create stock locations with name, address, and tags, so that I can organize central supply points. | `[new]` |
| E2-2 | As a PM, I want to link stock locations to properties, so that the app knows which locations supply which rentals. | `[new]` |
| E2-3 | As a PM, I want to view all stock locations for a property, so that I know where to pull stock from. | `[new]` |
| E2-4 | As a PM, I want to view all properties supplied by a stock location, so that I can plan routes. | `[new]` |
| E2-5 | As a PM, I want to create supply items with a base unit, so that I track products consistently across properties. | `[new]` |
| E2-6 | As a PM, I want to add SKUs under a supply item with pack size and price, so that the system calculates unit rates. | `[new]` |
| E2-7 | As a PM, I want multiple SKUs for the same supply item, so that I can buy from different suppliers interchangeably. | `[new]` |
| E2-8 | As a PM, I want to manage categories server-side, so that categories sync across team members and devices. | `[modify]` |
| E2-9 | As a PM, I want to receive purchased stock at a stock location, so that central inventory is accurate. | `[new]` |
| E2-10 | As a PM, I want to adjust stock at a location with a reason, so that I can correct discrepancies. | `[modify]` |
| E2-11 | As a PM, I want to archive supply items and SKUs with history, so that past replenishments remain traceable. | `[new]` |
| E2-12 | As a PM, I want to see low-stock SKUs at a location, so that I know what to reorder. | `[modify]` |

### E3: Property setup

| ID | Story | Tag |
|----|-------|-----|
| E3-1 | As a team owner, I want to create properties within my plan limit, so that I track each rental unit. | `[existing]` |
| E3-2 | As a PM, I want to assign a billing client to each property, so that scheduled invoices target the right contact. | `[new]` |
| E3-3 | As a PM, I want to view property stock by supply item in base units, so that I see what each property has. | `[modify]` |
| E3-4 | As a PM, I want to set reorder points per property per supply item, so that low-stock alerts are property-specific. | `[modify]` |
| E3-5 | As a PM, I want low-stock indicators to prompt replenishment, so that properties don't run out. | `[modify]` |
| E3-6 | As a PM, I want to transfer stock between properties via a stock location, so that each leg bills or refunds the correct property's client. | `[modify]` |
| E3-7 | As a PM, I want to set markup per property (defaulting from the client), so that bill-back reflects my pricing. | `[new]` |

### E4: Receive and manage stock

| ID | Story | Tag |
|----|-------|-----|
| E4-1 | As a PM, I want to receive stock by SKU at a stock location, so that purchases are recorded. | `[new]` |
| E4-2 | As a PM, I want receiving to create a ledger entry, so that stock changes are auditable. | `[new]` |
| E4-3 | As a PM, I want to bulk-import supply items and SKUs, so that I can migrate existing spreadsheets. | `[modify]` |
| E4-4 | As a PM, I want to export stock levels at a location, so that I can share with suppliers. | `[modify]` |
| E4-5 | As a PM, I want fractional pack quantities after break-pack replenishments, so that inventory reflects opened boxes. | `[new]` |
| E4-6 | As a PM, I want units displayed in my preferred locale (lb, fl oz), so that I read quantities naturally. | `[new]` |
| E4-7 | As a member, I want my stock operations limited to assigned properties, so that access is controlled. | `[existing]` |
| E4-8 | As a member, I want my item creation capped by maxInventoryItems, so that owners control usage on Free plan. | `[existing]` |

### E5: Replenish properties

| ID | Story | Tag |
|----|-------|-----|
| E5-1 | As a PM, I want to start a replenishment by selecting stock location and property, so that stock moves correctly. | `[new]` |
| E5-2 | As a PM, I want to select which SKU to pull from, so that I use what's on the shelf. | `[new]` |
| E5-3 | As a PM, I want to enter quantity in base units (pods), so that I deploy what the property needs. | `[new]` |
| E5-4 | As a PM, I want the system to decrement fractional packs at the location, so that break-pack is handled automatically. | `[new]` |
| E5-5 | As a PM, I want bill-back calculated from the SKU unit rate plus property/client markup, so that client charges are accurate. | `[new]` |
| E5-6 | As a PM, I want replenishment recorded as unbilled until the client's next scheduled invoice, so that billing is batched. | `[new]` |
| E5-7 | As a PM, I want to reverse a replenishment (return to stock location) with credit on the next invoice, so that mistakes can be corrected. | `[new]` |
| E5-8 | As a PM, I want replenishment history per property, so that I can audit what was deployed. | `[new]` |
| E5-9 | As a PM, I want inter-property transfers to pass through a stock location as a return then replenish, so that both legs are billed/refunded like any other transaction. | `[modify]` |
| E5-10 | As a PM, I want replenishment blocked when stock location has insufficient packs, so that inventory never goes negative. | `[new]` |

### E6: Client billing and export

| ID | Story | Tag |
|----|-------|-----|
| E6-1 | As a PM, I want draft invoices auto-generated on each client's schedule (weekly / biweekly / monthly EOM), so that billing is efficient. | `[new]` |
| E6-2 | As a PM, I want one invoice per client per period with lines broken down by property, so that clients get a single bill with clear property detail. | `[new]` |
| E6-3 | As a PM, I want to set billing frequency per client, so that different clients can be billed on different cadences. | `[new]` |
| E6-4 | As a PM, I want to review and edit draft invoices before sending, so that I catch errors. | `[existing]` |
| E6-5 | As a PM, I want to email invoices with HTML body and PDF attachment using my branding, so that they look professional. | `[modify]` |
| E6-6 | As a PM, I want to export invoices to CSV, so that I can import into accounting software. | `[new]` |
| E6-7 | As a PM, I want to mark invoices paid or overdue manually, so that I track payment status. | `[existing]` |
| E6-8 | As a PM, I want invoice lines traced to replenishments, so that clients can verify charges. | `[new]` |
| E6-9 | As a PM, I want unbilled replenishments and reverse credits to carry forward, so that nothing is lost between periods. | `[new]` |
| E6-10 | As a PM, I want to manage client contact records and default markup, so that invoices and pricing are correct. | `[modify]` |

### E7: Reporting and shopping list

| ID | Story | Tag |
|----|-------|-----|
| E7-1 | As a PM, I want a dashboard showing stock health and overdue invoices, so that I see problems quickly. | `[existing]` |
| E7-2 | As a PM, I want movement history reports, so that I can audit stock changes. | `[modify]` |
| E7-3 | As a PM, I want a shopping list of low-stock items (Pro), so that I know what to buy. | `[existing]` |
| E7-4 | As a PM, I want inventory value reports, so that I understand capital tied up in stock. | `[modify]` |
| E7-5 | As a PM, I want CSV export of reports, so that I can analyze in spreadsheets. | `[existing]` |
| E7-6 | As a PM, I want usage summary by property, so that I see consumption patterns (from replenishment data). | `[modify]` |

### E8: SaaS billing and trials

| ID | Story | Tag |
|----|-------|-----|
| E8-1 | As a user, I want to start a 14-day Starter or Pro trial, so that I can evaluate paid features. | `[existing]` |
| E8-2 | As an org owner, I want to subscribe via Stripe checkout, so that I pay for Stock Stay. | `[existing]` |
| E8-3 | As an org owner, I want to manage my subscription in the Stripe customer portal, so that I can update payment methods. | `[existing]` |
| E8-4 | As an org owner, I want to purchase extra user slots, so that I can add team members beyond plan limits. | `[existing]` |
| E8-5 | As a visitor on the marketing site, I want plan limits shown from the live product config, so that pricing pages stay accurate. | `[new]` |

### Removed stories

| ID | Story | Tag |
|----|-------|-----|
| R-1 | As a PM, I want to create a sale and auto-generate an invoice, so that I track stock-out transactions. | `[remove]` |
| R-2 | As a PM, I want to bill a client when I subtract inventory directly, so that stock reduction triggers billing. | `[remove]` |
| R-3 | As a PM, I want to optionally create an invoice immediately at replenishment, so that I can bill ad-hoc. | `[remove]` (deferred) |
| R-4 | As a visitor, I want to log into a shared demo account, so that I can try the product without signing up. | `[remove]` (Strategy: remove demo; onboard real users) |

---

## 9. Non-functional requirements

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| NFR-1 | Separate dev, staging, and production environments with distinct databases and secrets | Must | Assessment |
| NFR-2 | All stock mutations go through a centralized ledger service | Must | Assessment |
| NFR-3 | Super-admin interface for customer support | Should | Assessment |
| NFR-4 | Viewer role enforced as read-only on all write API endpoints | Must | Assessment + this doc |
| NFR-5 | IDOR prevention: all resources scoped to user's team/org | Must | Assessment |
| NFR-6 | Immutable audit trail (StockTransaction) for all quantity changes | Must | Assessment |
| NFR-7 | Decimal types for financial and quantity fields | Must | Assessment |
| NFR-8 | Database migrations reliable across dev/staging/production | Must | Assessment |
| NFR-9 | PITR backups configured and recovery tested | Should | Assessment |
| NFR-10 | Rate limiting, Helmet, and input sanitization / validation on API write paths | Must | Existing + Strategy |
| NFR-11 | Automated test harness derived from user stories in Section 8 | Should | Product strategy |
| NFR-12 | **Remove** shared demo-account functionality; onboard real users. Demo/test data only in non-prod environments | Must | Strategy |
| NFR-13 | Redirect unauthenticated users to /login for protected routes | Must | Existing |
| NFR-14 | Server-side event logs for auth, billing/webhooks, and stock ledger posts | Should | Assessment + Strategy |
| NFR-15 | Plan limit config is single source of truth for API enforcement and marketing UI | Must | Validation |
| NFR-16 | Invoice send produces PDF attachment and branded HTML email | Must | Validation |
| NFR-17 | Row-level locking (or equivalent) on concurrent stock balance updates | Must | Strategy |
| NFR-18 | Schema uses enums, unique constraints, and explicit FK `onDelete` where required (BR-22) | Must | Assessment |
| NFR-19 | Basic product analytics (Umami or GA4) with page views and signup/activation events | Should | Strategy |
| NFR-20 | In-app feedback / bug report path (link or widget) | Should | Strategy |
| NFR-21 | Terms of Service and Privacy Policy reachable from app and marketing site | Must | Strategy |
| NFR-22 | Cookie disclosure if cookies are used; prefer LocalStorage for auth tokens | Should | Strategy |
| NFR-23 | User data deletion supported via customer support for alpha (self-serve optional later) | Should | Strategy |
| NFR-24 | Lightweight dependency hygiene: keep Vite/Prisma (and critical deps) on patched versions | Should | Assessment |

---

## 10. Out of scope / future

The following are **explicitly deferred**. Implementation agents must not scope-creep into these without a new requirements revision.

| Feature | Notes |
|---------|-------|
| Client portal | Login for clients to view invoices online |
| In-app client payment | Stripe Connect, ACH, card on invoice |
| Consumption / guest usage tracking | Billing driven by location↔property movements only in v1 |
| PMS integrations | Guesty, Hostaway, etc. |
| Fixed-asset checklist | Cleaner verification of owner-owned items |
| Barcode / QR scanning | Mobile scan workflows |
| Multi-currency | Single currency assumed in v1 |
| Tax engine | Simple percentage tax on invoices; no jurisdiction rules |
| Ad-hoc invoice at replenishment | Explicitly deferred — adds UX complexity |
| QuickBooks / Xero native export | CSV only in v1 |
| Separate credit-note documents | Credits roll onto next invoice |
| Production data migration | Not needed — service has not launched |
| Full event sourcing | Immutable StockTransaction ledger is sufficient; no event-store rewrite |
| Forensic RLS / deep IDOR pen-test | Strategy Phase 4 |
| Self-serve account deletion UI | Support-handled for alpha (NFR-23) |

---

## 11. Resolved decisions

| ID | Topic | Decision |
|----|-------|----------|
| Q1 | Billing schedule cadence | Per client: **weekly**, **biweekly**, or **monthly end-of-month**. Editable per client. |
| Q2 | Bill-back pricing | Markup **per property**, with a **default markup per client**. Applied on top of SKU unit rate. |
| Q3 | Invoice grouping | **One invoice per client** per period, with line items **broken down by property**. |
| Q4 | Ad-hoc invoice at replenishment | **Out of scope** for now (UX complexity). |
| Q5 | Replenishment reversals | **Credit on next invoice** for that client. No separate credit-note document. |
| Q6 | Inter-property transfers | Pass through a stock location as **two ordinary transactions**: Property→Location **credits** source; Location→Property **bills** destination. |
| Q7 | Negative stock | **Hard block** — prevent negative StockOnHand. |
| Q8 | Inventory migration | **Replace** existing models; no migration (pre-launch). |
| Q9 | Clients/invoices migration | **Replace** existing models; no migration (pre-launch). |
| Q10 | Stock location fields | **Name + address + tags** sufficient. |
| Q11 | Plan limits | Support configurable caps for stock locations, supply items, SKUs (and existing limits). UI/marketing read config **live**. |
| Q12 | Multi-team users | **Schema and UI in v1** so multi-team can be tested end-to-end. |
| Q13 | Accounting export | **CSV** sufficient for v1. |
| Q14 | Invoice artifacts | **PDF**, **email HTML**, and **CSV** all required. |

### Still open

- [ ] **Q1b — Billing timezone:** Which timezone defines period boundaries (weekly / biweekly / monthly EOM)? Candidates include: team owner timezone at signup, org/team setting (editable), property timezone, UTC, or browser-local at invoice generation. **Defer decision until scheduled billing work (Appendix A step for billing engine).** Do not implement timezone capture at signup until this is decided.

### Design note: why inter-property is always billable/refundable

Uniform rule: every stock-location ↔ property movement bills or refunds. Pass-through keeps the ledger auditable and avoids a special non-billable transfer path.

**Edge cases to accept (or watch in UX):**

1. **Same client, both properties** — One invoice shows a credit under Property A and a charge under Property B. Net may be ~$0 if rates/markups match; if property markups differ, a small net charge/credit is correct under the markup rules.
2. **Different clients** — Source client is credited; destination client is billed. That is the intended economic outcome of moving stock between owners.
3. **Rate for the return leg** — Credit uses the SKU chosen for the pass-through and the **source property's** effective markup (snapshotted), same as any other return.

---

## Appendix A: Recommended implementation sequence

Order reflects Product Strategy Phase 2 priorities (envs early) plus domain work.

1. **Environment separation** — distinct dev / staging / prod DBs and secrets; remove shared demo-account path from production; document deploy per environment. See [docs/environments.md](environments.md).
2. **Organization + UserMembership** schema and **team-switching UI** (timezone field deferred pending Q1b)
3. **Stock Location + SupplyItem + SKU + UnitOfMeasure** models, with **schema integrity** (enums, uniques, FKs, decimals) from the start — **Done** (schema + thin CRUD APIs; catalogue UI and Inventory replacement deferred)
4. **StockTransaction ledger engine** — break-pack math, negative-stock guards, **row-level locking** on balance updates — **Done** (PropertyStock + StockTransaction + `stockLedger.js`; receive/adjust APIs; replenishment UI in step 5)
5. **Replenishment + return** workflows (API + UI), including next-invoice credits
6. **Inter-property transfer** as linked return + replenish (both billable)
7. **Scheduled client billing** engine (per-client frequency) + PDF / email HTML / CSV — **resolve Q1b (timezone) here before coding period math**
8. **Configurable plan limits** (live-read by UI and marketing) + **plan downgrade rules** (BR-20)
9. **Streamlined signup** (minimal fields; no payment required to start)
10. **Replace** Sale / Inventory / deprecated bill-to-client paths; light cleanup of dead code
11. **Super-admin interface** + **viewer role enforcement** on write APIs
12. **Pre-alpha ops slice** — in-app feedback, basic analytics (Umami/GA4), ToS/Privacy links, cookie policy or LocalStorage-only auth confirmation, support-path data deletion
13. **Test harness** derived from Section 8 user stories (auto-generate then flesh out)
14. PITR recovery check + dependency hygiene (Prisma/Vite patches) as capacity allows

---

## Appendix B: Key codebase references (current)

| Area | Path |
|------|------|
| Schema | `server/prisma/schema.prisma` |
| API server | `server/server.js` |
| DB operations | `server/db.js` |
| Stock ledger | `server/stockLedger.js` |
| Plan limits | `server/trialManager.js` |
| Stripe SaaS billing | `server/billing.js` |
| Invoice email | `server/email.js` |
| Frontend routes | `src/App.tsx` |
| Access control | `src/components/ProtectedRoute.tsx` |
| Bill-to-client (deprecated path) | `src/components/BillToClientModal.tsx` |
| Categories (localStorage) | `src/hooks/useCategories.ts` |

---

## Appendix C: Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-02-23 | Probable | Initial draft for David validation |
| 0.2 | 2026-07-12 | Probable | Incorporated validated answers Q1–Q11, Q13–Q14 |
| 0.3 | 2026-07-12 | Probable | Q12: multi-team schema+UI in v1; inter-property legs always bill/refund |
| 0.4 | 2026-07-12 | Probable | Pre-alpha gaps from assessment/strategy; timezone reopened as Q1b; Appendix A reordered |
| 0.5 | 2026-07-23 | Probable | Appendix A #3: StockLocation, SupplyItem, Sku, UnitOfMeasure, StockOnHand, StockLocationProperty (+ thin CRUD APIs); Inventory still current until step 10 |
| 0.6 | 2026-07-23 | Probable | Appendix A #4: PropertyStock + StockTransaction ledger (`stockLedger.js`) with Decimal break-pack, FOR UPDATE locks, postingId, receive/adjust APIs |

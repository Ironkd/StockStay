import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {
  initDemoUser,
  userOps,
  teamOps,
  warehouseOps,
  inventoryOps,
  clientOps,
  invoiceOps,
  saleOps,
  invitationOps,
  prisma,
} from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Require JWT_SECRET in production – never use default secret when deployed
if (isProduction && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET must be set in production. Set it in your environment.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const CORS_ORIGIN = process.env.CORS_ORIGIN; // e.g. https://app.staystock.com

// Security: secure headers
app.use(helmet());

// Middleware – restrict origin in production for security
app.use(
  cors(
    CORS_ORIGIN
      ? { origin: CORS_ORIGIN, credentials: true }
      : undefined
  )
);
app.use(express.json());

// Rate limit for login – prevent brute force (10 attempts per 15 min per IP)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Initialize demo user and team if no users exist
initDemoUser().catch((err) => {
  console.error("Error initializing demo user:", err);
});

// ==================== AUTH ROUTES ====================

const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address"),
  body("password").notEmpty().trim().withMessage("Password is required"),
];

app.post("/api/auth/login", loginRateLimiter, loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }

    const { email, password } = req.body;

    console.log(`[LOGIN] Attempting login for: ${email}`);
    let user = await userOps.findByEmail(email);
    console.log(`[LOGIN] User found:`, user ? `Yes (${user.email})` : 'No');

    // For demo purposes, accept any email/password combination
    // In production, you'd verify the password with bcrypt
    if (!user) {
      console.log(`[LOGIN] User not found - creating new user...`);
      // Create a new user and personal team for demo
      const hashedPassword = await bcrypt.hash(password, 10);
      const teamId = crypto.randomUUID();

      // Create team first
      await teamOps.create({
        id: teamId,
        name: `${email.split("@")[0]}'s Team`,
        ownerId: crypto.randomUUID(),
      });

      const newUserId = crypto.randomUUID();
      
      // Update team with correct ownerId
      await teamOps.update(teamId, { ownerId: newUserId });

      // Create user
      user = await userOps.create({
        id: newUserId,
        email,
        name: email.split("@")[0],
        password: hashedPassword,
        teamId,
        teamRole: "owner",
        maxInventoryItems: null,
        allowedPages: null,
        allowedWarehouseIds: null,
      });

      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          teamId: user.teamId,
          teamRole: user.teamRole,
          maxInventoryItems: user.maxInventoryItems,
          allowedPages: user.allowedPages,
          allowedWarehouseIds: user.allowedWarehouseIds,
        },
        token,
      });
    }

    // Verify password for existing users
    console.log(`[LOGIN] Verifying password for existing user...`);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log(`[LOGIN] Password valid:`, isPasswordValid);
    if (!isPasswordValid) {
      console.log(`[LOGIN] Password mismatch - returning 401`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Ensure legacy users get sensible defaults
    const updates = {};
    if (!user.teamId) {
      const teamId = crypto.randomUUID();
      await teamOps.create({
        id: teamId,
        name: `${user.name || user.email.split("@")[0]}'s Team`,
        ownerId: user.id,
      });
      updates.teamId = teamId;
    }
    if (!user.teamRole) {
      updates.teamRole = "owner";
    }
    if (typeof user.allowedPages === "undefined") {
      updates.allowedPages = null;
    }
    if (typeof user.allowedWarehouseIds === "undefined") {
      updates.allowedWarehouseIds = null;
    }

    if (Object.keys(updates).length > 0) {
      user = await userOps.update(user.id, updates);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        teamId: user.teamId,
        teamRole: user.teamRole,
        maxInventoryItems: user.maxInventoryItems ?? null,
        allowedPages: user.allowedPages ?? null,
        allowedWarehouseIds: user.allowedWarehouseIds ?? null,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        message: "Database connection failed. Please check your Supabase connection." 
      });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/auth/logout", authenticateToken, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    let user = await userOps.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure legacy users have team/role defaults
    const updates = {};
    if (!user.teamId) {
      const teamId = crypto.randomUUID();
      await teamOps.create({
        id: teamId,
        name: `${user.name || user.email.split("@")[0]}'s Team`,
        ownerId: user.id,
      });
      updates.teamId = teamId;
    }
    if (!user.teamRole) {
      updates.teamRole = "owner";
    }
    if (typeof user.allowedPages === "undefined") {
      updates.allowedPages = null;
    }
    if (typeof user.allowedWarehouseIds === "undefined") {
      updates.allowedWarehouseIds = null;
    }

    if (Object.keys(updates).length > 0) {
      user = await userOps.update(user.id, updates);
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      teamId: user.teamId,
      teamRole: user.teamRole,
      maxInventoryItems: user.maxInventoryItems ?? null,
      allowedPages: user.allowedPages ?? null,
      allowedWarehouseIds: user.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Simple helper for page-level access control
const userHasPageAccess = (user, pageKey) => {
  if (!user) return false;
  // Home is always allowed
  if (pageKey === "home") return true;
  // Owners or users without restrictions can see everything
  if (!user.allowedPages || user.teamRole === "owner") return true;
  return Array.isArray(user.allowedPages) && user.allowedPages.includes(pageKey);
};

// ==================== WAREHOUSE ROUTES ====================

// Get current team's warehouses
app.get("/api/warehouses", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    const warehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
    res.json(warehouses);
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    res.status(500).json({ message: "Error fetching warehouses" });
  }
});

// Create a new warehouse for the current team,
// enforcing plan-based maxWarehouses limits.
app.post("/api/warehouses", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    // Only owners can create warehouses (simple rule for now)
    if (currentUser.teamRole !== "owner") {
      return res
        .status(403)
        .json({ message: "Only team owners can create warehouses." });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    // Derive effective limits
    const effectivePlan = team.plan || "free";
    const effectiveMaxWarehouses =
      typeof team.maxWarehouses === "number"
        ? team.maxWarehouses
        : effectivePlan === "free"
        ? 1
        : null; // null = unlimited for paid plans

    const currentCount = await warehouseOps.countByTeam(team.id);

    if (effectiveMaxWarehouses !== null && currentCount >= effectiveMaxWarehouses) {
      return res.status(403).json({
        message:
          effectivePlan === "free"
            ? "Free plan allows only 1 warehouse. Upgrade your plan to add more."
            : "Warehouse limit reached for your current plan.",
      });
    }

    const { name, location } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Warehouse name is required." });
    }

    const warehouse = await warehouseOps.createForTeam(currentUser.teamId, {
      name,
      location,
    });

    res.status(201).json(warehouse);
  } catch (error) {
    console.error("Error creating warehouse:", error);
    res.status(500).json({ message: "Error creating warehouse" });
  }
});

// ==================== INVENTORY ROUTES ====================

app.get("/api/inventory", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    let items = await inventoryOps.findAll();

    // If the user has warehouse restrictions, only return items from allowed warehouses
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      items = items.filter(
        (item) =>
          item.warehouseId &&
          currentUser.allowedWarehouseIds.includes(item.warehouseId)
      );
    }

    res.json(items);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ message: "Error fetching inventory" });
  }
});

app.get("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const item = await inventoryOps.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Enforce warehouse-level restrictions
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0 &&
      (!item.warehouseId ||
        !currentUser.allowedWarehouseIds.includes(item.warehouseId))
    ) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ message: "Error fetching item" });
  }
});

app.post("/api/inventory", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    // Simple per-user limit: total inventory items across the app
    const inventoryCount = await inventoryOps.count();
    if (
      currentUser &&
      typeof currentUser.maxInventoryItems === "number" &&
      inventoryCount >= currentUser.maxInventoryItems
    ) {
      return res.status(403).json({
        message: `Inventory item limit reached (${currentUser.maxInventoryItems}).`,
      });
    }

    // Warehouse-level restrictions – user can only create items in allowed warehouses
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      const warehouseId = req.body.warehouseId;
      if (
        !warehouseId ||
        !currentUser.allowedWarehouseIds.includes(warehouseId)
      ) {
        return res.status(403).json({
          message: "You are not allowed to use this warehouse for new items.",
        });
      }
    }

    const newItem = await inventoryOps.create({
      ...req.body,
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ message: "Error creating item" });
  }
});

app.post("/api/inventory/bulk", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const incomingCount = Array.isArray(req.body.items) ? req.body.items.length : 0;
    const inventoryCount = await inventoryOps.count();

    if (
      currentUser &&
      typeof currentUser.maxInventoryItems === "number" &&
      inventoryCount + incomingCount > currentUser.maxInventoryItems
    ) {
      return res.status(403).json({
        message: `Bulk import would exceed your inventory item limit (${currentUser.maxInventoryItems}).`,
      });
    }

    // Ensure all imported items stay within allowed warehouses (if restricted)
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0 &&
      Array.isArray(req.body.items)
    ) {
      const invalidItem = req.body.items.find(
        (item) =>
          !item.warehouseId ||
          !currentUser.allowedWarehouseIds.includes(item.warehouseId)
      );
      if (invalidItem) {
        return res.status(403).json({
          message:
            "Bulk import includes items for warehouses you are not allowed to access.",
        });
      }
    }

    const items = await Promise.all(
      req.body.items.map((item) => inventoryOps.create(item))
    );

    res.status(201).json(items);
  } catch (error) {
    console.error("Error creating items:", error);
    res.status(500).json({ message: "Error creating items" });
  }
});

app.put("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const existingItem = await inventoryOps.findById(req.params.id);

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Enforce warehouse-level restrictions for updates
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      const targetWarehouseId =
        typeof req.body.warehouseId !== "undefined"
          ? req.body.warehouseId
          : existingItem.warehouseId;

      if (
        !targetWarehouseId ||
        !currentUser.allowedWarehouseIds.includes(targetWarehouseId)
      ) {
        return res.status(403).json({
          message: "You are not allowed to modify items in this warehouse.",
        });
      }
    }

    const updatedItem = await inventoryOps.update(req.params.id, req.body);
    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Error updating item" });
  }
});

app.delete("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const item = await inventoryOps.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    await inventoryOps.delete(req.params.id);
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Error deleting item" });
  }
});

app.delete("/api/inventory", authenticateToken, async (req, res) => {
  try {
    await inventoryOps.deleteAll();
    res.json({ message: "All items deleted successfully" });
  } catch (error) {
    console.error("Error clearing inventory:", error);
    res.status(500).json({ message: "Error clearing inventory" });
  }
});

// ==================== CLIENTS ROUTES ====================

app.get("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }

    const clients = await clientOps.findAll();
    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Error fetching clients" });
  }
});

app.get("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ message: "Error fetching client" });
  }
});

app.post("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const newClient = await clientOps.create(req.body);
    res.status(201).json(newClient);
  } catch (error) {
    console.error("Error creating client:", error);
    res.status(500).json({ message: "Error creating client" });
  }
});

app.put("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const updatedClient = await clientOps.update(req.params.id, req.body);
    res.json(updatedClient);
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ message: "Error updating client" });
  }
});

app.delete("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    await clientOps.delete(req.params.id);
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ message: "Error deleting client" });
  }
});

// ==================== INVOICES ROUTES ====================

app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }

    const invoices = await invoiceOps.findAll();
    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Error fetching invoices" });
  }
});

app.get("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Error fetching invoice" });
  }
});

app.post("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoiceData = req.body;

    // If invoice items are linked to inventory, validate and update stock
    if (invoiceData.items && Array.isArray(invoiceData.items)) {
      // Validate inventory availability
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (!inventoryItem) {
          return res.status(400).json({
            message: `Inventory item ${item.name || item.inventoryItemId} not found`,
          });
        }
        if (item.quantity > inventoryItem.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          });
        }
      }

      // Deduct quantities from inventory
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(item.inventoryItemId, {
            quantity: inventoryItem.quantity - item.quantity,
          });
        }
      }
    }

    const newInvoice = await invoiceOps.create(invoiceData);
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Error creating invoice" });
  }
});

app.put("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const existingInvoice = await invoiceOps.findById(req.params.id);

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const invoiceData = req.body;

    // If items are being updated and contain inventory-linked lines, adjust stock
    if (
      invoiceData.items &&
      Array.isArray(invoiceData.items) &&
      JSON.stringify(invoiceData.items) !== JSON.stringify(existingInvoice.items)
    ) {
      // First restore inventory for old items that were linked to inventory
      for (const oldItem of existingInvoice.items || []) {
        if (!oldItem.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(oldItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(oldItem.inventoryItemId, {
            quantity: inventoryItem.quantity + oldItem.quantity,
          });
        }
      }

      // Validate new items
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (!inventoryItem) {
          // Restore old quantities
          for (const oldItem of existingInvoice.items || []) {
            if (!oldItem.inventoryItemId) continue;
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Inventory item ${item.name || item.inventoryItemId} not found`,
          });
        }
        if (item.quantity > inventoryItem.quantity) {
          // Restore old quantities
          for (const oldItem of existingInvoice.items || []) {
            if (!oldItem.inventoryItemId) continue;
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          });
        }
      }

      // Apply new quantities
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(item.inventoryItemId, {
            quantity: inventoryItem.quantity - item.quantity,
          });
        }
      }
    }

    const updatedInvoice = await invoiceOps.update(req.params.id, invoiceData);
    res.json(updatedInvoice);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Error updating invoice" });
  }
});

app.delete("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    await invoiceOps.delete(req.params.id);
    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Error deleting invoice" });
  }
});

// ==================== SALES ROUTES ====================

// Build invoice payload from a single sale (for one active invoice per sale)
function buildInvoiceFromSale(sale, saleId = null) {
  const invoiceItems = (sale.items || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.inventoryItemName || item.name || "Item",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total ?? item.quantity * item.unitPrice,
    inventoryItemId: item.inventoryItemId,
    sku: item.sku,
  }));
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return {
    invoiceNumber: `INV-SALE-${sale.saleNumber}`,
    clientId: sale.clientId,
    clientName: sale.clientName || "",
    date: sale.date,
    dueDate,
    items: invoiceItems,
    subtotal: sale.subtotal ?? 0,
    tax: sale.tax ?? 0,
    total: sale.total ?? 0,
    status: "draft",
    notes: sale.notes ? `From Sale #${sale.saleNumber}. ${sale.notes}` : `From Sale #${sale.saleNumber}`,
    saleId: saleId || null,
  };
}

// Helper function to sync invoice with all sales for a client (legacy aggregated invoice)
const syncInvoiceForClient = async (clientId) => {
  if (!clientId) return;

  // Get all sales for this client
  const allSales = await saleOps.findAll();
  const clientSales = allSales.filter((sale) => sale.clientId === clientId);

  // Get all invoices
  const allInvoices = await invoiceOps.findAll();
  const autoInvoice = allInvoices.find(
    (inv) => inv.clientId === clientId && inv.notes === "Auto-generated from sales"
  );

  if (clientSales.length === 0) {
    // If no sales, remove auto-generated invoice if it exists
    if (autoInvoice) {
      await invoiceOps.delete(autoInvoice.id);
    }
    return;
  }

  // Find the client to get client name
  const client = await clientOps.findById(clientId);
  if (!client) return;

  // Aggregate all sales into invoice items
  const itemMap = new Map();
  let totalSubtotal = 0;
  let totalTax = 0;
  let latestSaleDate = "";

  for (const sale of clientSales) {
    // Track the latest sale date
    if (!latestSaleDate || sale.date > latestSaleDate) {
      latestSaleDate = sale.date;
    }

    // Aggregate items from this sale
    for (const saleItem of sale.items || []) {
      const key = `${saleItem.inventoryItemId}-${saleItem.unitPrice}`;
      if (itemMap.has(key)) {
        const existingItem = itemMap.get(key);
        existingItem.quantity += saleItem.quantity;
        existingItem.total = existingItem.quantity * existingItem.unitPrice;
      } else {
        itemMap.set(key, {
          id: crypto.randomUUID(),
          name: saleItem.inventoryItemName,
          quantity: saleItem.quantity,
          unitPrice: saleItem.unitPrice,
          total: saleItem.quantity * saleItem.unitPrice,
        });
      }
    }

    // Aggregate tax (use the tax rate from the most recent sale)
    totalSubtotal += sale.subtotal || 0;
    totalTax += (sale.subtotal || 0) * ((sale.tax || 0) / 100);
  }

  const invoiceItems = Array.from(itemMap.values());
  const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  const taxRate = totalSubtotal > 0 ? (totalTax / totalSubtotal) * 100 : 0;
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;

  // Generate month-based invoice number (e.g., "INV-2026-01" for January 2026)
  const saleDate = new Date(latestSaleDate);
  const year = saleDate.getFullYear();
  const month = String(saleDate.getMonth() + 1).padStart(2, "0");
  const monthBasedInvoiceNumber = `INV-${year}-${month}`;

  if (autoInvoice) {
    // Update existing auto-generated invoice
    await invoiceOps.update(autoInvoice.id, {
      invoiceNumber: monthBasedInvoiceNumber,
      date: latestSaleDate,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      items: invoiceItems,
      subtotal: subtotal,
      tax: tax,
      total: total,
    });
  } else {
    // Create new auto-generated invoice
    await invoiceOps.create({
      invoiceNumber: monthBasedInvoiceNumber,
      clientId: clientId,
      clientName: client.name,
      date: latestSaleDate,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      items: invoiceItems,
      subtotal: subtotal,
      tax: tax,
      total: total,
      status: "draft",
      notes: "Auto-generated from sales",
    });
  }
};

app.get("/api/sales", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }

    const sales = await saleOps.findAll();
    res.json(sales);
  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({ message: "Error fetching sales" });
  }
});

app.get("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    const sale = await saleOps.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    res.json(sale);
  } catch (error) {
    console.error("Error fetching sale:", error);
    res.status(500).json({ message: "Error fetching sale" });
  }
});

app.post("/api/sales", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    const saleData = req.body;

    // Validate that all items have sufficient inventory
    for (const saleItem of saleData.items || []) {
      const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
      if (!inventoryItem) {
        return res.status(400).json({
          message: `Inventory item ${saleItem.inventoryItemName || saleItem.inventoryItemId} not found`,
        });
      }
      if (saleItem.quantity > inventoryItem.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${saleItem.quantity}`,
        });
      }
    }

    // Create the sale
    const newSale = await saleOps.create(saleData);

    // Update inventory quantities
    for (const saleItem of saleData.items || []) {
      const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
      if (inventoryItem) {
        await inventoryOps.update(saleItem.inventoryItemId, {
          quantity: inventoryItem.quantity - saleItem.quantity,
        });
      }
    }

    // Create one active (draft) invoice for this sale (best-effort; sale still succeeds if this fails)
    try {
      const invoicePayload = buildInvoiceFromSale({ ...saleData, ...newSale }, newSale.id);
      await invoiceOps.create(invoicePayload);
    } catch (invoiceError) {
      // If DB doesn't have saleId column yet, create invoice without it so the invoice still exists
      console.error("Error creating invoice from sale (sale was saved):", invoiceError);
      try {
        const { saleId: _s, ...payloadWithoutSaleId } = buildInvoiceFromSale({ ...saleData, ...newSale }, newSale.id);
        await invoiceOps.create(payloadWithoutSaleId);
      } catch (retryError) {
        console.error("Retry creating invoice without saleId failed:", retryError);
      }
    }

    res.status(201).json(newSale);
  } catch (error) {
    console.error("Error creating sale:", error);
    res.status(500).json({ message: "Error creating sale" });
  }
});

app.put("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    const oldSale = await saleOps.findById(req.params.id);

    if (!oldSale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const saleData = req.body;

    // If items are being updated, restore old quantities and validate new ones
    if (saleData.items && JSON.stringify(saleData.items) !== JSON.stringify(oldSale.items)) {
      // Restore old inventory quantities
      for (const oldItem of oldSale.items || []) {
        const inventoryItem = await inventoryOps.findById(oldItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(oldItem.inventoryItemId, {
            quantity: inventoryItem.quantity + oldItem.quantity,
          });
        }
      }

      // Validate new quantities
      for (const saleItem of saleData.items) {
        const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
        if (!inventoryItem) {
          // Restore old quantities
          for (const oldItem of oldSale.items || []) {
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Inventory item ${saleItem.inventoryItemName || saleItem.inventoryItemId} not found`,
          });
        }
        if (saleItem.quantity > inventoryItem.quantity) {
          // Restore old quantities
          for (const oldItem of oldSale.items || []) {
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${saleItem.quantity}`,
          });
        }
      }

      // Update inventory with new quantities
      for (const saleItem of saleData.items) {
        const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(saleItem.inventoryItemId, {
            quantity: inventoryItem.quantity - saleItem.quantity,
          });
        }
      }
    }

    const updatedSale = await saleOps.update(req.params.id, saleData);

    // Update the linked invoice for this sale
    const linkedInvoice = await invoiceOps.findBySaleId(oldSale.id);
    if (linkedInvoice) {
      const invoicePayload = buildInvoiceFromSale(updatedSale, oldSale.id);
      await invoiceOps.update(linkedInvoice.id, invoicePayload);
    }

    res.json(updatedSale);
  } catch (error) {
    console.error("Error updating sale:", error);
    res.status(500).json({ message: "Error updating sale" });
  }
});

app.delete("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    const sale = await saleOps.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // Restore inventory quantities when sale is deleted
    for (const saleItem of sale.items || []) {
      const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
      if (inventoryItem) {
        await inventoryOps.update(saleItem.inventoryItemId, {
          quantity: inventoryItem.quantity + saleItem.quantity,
        });
      }
    }

    // Delete the linked invoice for this sale
    const linkedInvoice = await invoiceOps.findBySaleId(sale.id);
    if (linkedInvoice) {
      await invoiceOps.delete(linkedInvoice.id);
    }

    await saleOps.delete(req.params.id);

    res.json({ message: "Sale deleted successfully" });
  } catch (error) {
    console.error("Error deleting sale:", error);
    res.status(500).json({ message: "Error deleting sale" });
  }
});

// ==================== TEAM & INVITE ROUTES ====================

// Get team details, members and invitations for the current user
app.get("/api/team", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);

    if (!user || !user.teamId) {
      return res.status(404).json({ message: "Team not found for user" });
    }

    if (!userHasPageAccess(user, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    const team = await teamOps.findById(user.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const members = await userOps.findAllByTeam(user.teamId);
    const membersFormatted = members.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      teamRole: u.teamRole || (u.id === team.ownerId ? "owner" : "member"),
      maxInventoryItems: u.maxInventoryItems ?? null,
      allowedPages: u.allowedPages ?? null,
      allowedWarehouseIds: u.allowedWarehouseIds ?? null,
    }));

    const invitations = await invitationOps.findAllByTeam(user.teamId);
    const invitationsFormatted = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      teamRole: inv.teamRole,
      maxInventoryItems: inv.maxInventoryItems ?? null,
      status: inv.status,
      token: inv.token,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      allowedPages: inv.allowedPages ?? null,
      allowedWarehouseIds: inv.allowedWarehouseIds ?? null,
    }));

    // Count warehouses for basic plan/usage info
    const warehouseCount = await warehouseOps.countByTeam(team.id);

    res.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        plan: team.plan || "free",
        maxWarehouses: team.maxWarehouses,
        warehouseCount,
      },
      members: membersFormatted,
      invitations: invitationsFormatted,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Error fetching team information" });
  }
});

// Create an invitation for the current user's team
app.post("/api/team/invitations", authenticateToken, async (req, res) => {
  try {
    const {
      email,
      teamRole = "member",
      maxInventoryItems = null,
      allowedPages = null,
      allowedWarehouseIds = null,
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const currentUser = await userOps.findById(req.user.id);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }

    if (!userHasPageAccess(currentUser, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can invite new members" });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const normalisedAllowedPages =
      Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : null;
    const normalisedAllowedWarehouseIds =
      Array.isArray(allowedWarehouseIds) && allowedWarehouseIds.length > 0
        ? allowedWarehouseIds
        : null;

    const invitation = await invitationOps.create({
      teamId: currentUser.teamId,
      email,
      teamRole,
      maxInventoryItems: typeof maxInventoryItems === "number" ? maxInventoryItems : null,
      allowedPages: normalisedAllowedPages,
      allowedWarehouseIds: normalisedAllowedWarehouseIds,
      status: "pending",
      token: crypto.randomUUID(),
      expiresAt,
      invitedByUserId: currentUser.id,
    });

    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      teamRole: invitation.teamRole,
      maxInventoryItems: invitation.maxInventoryItems,
      status: invitation.status,
      token: invitation.token,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      allowedPages: invitation.allowedPages,
      allowedWarehouseIds: invitation.allowedWarehouseIds,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ message: "Error creating invitation" });
  }
});

// Accept an invitation using its token – the currently authenticated user is added to the team
app.post("/api/team/invitations/accept", authenticateToken, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const invitation = await invitationOps.findByToken(token);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Invitation is no longer valid" });
    }

    const now = new Date();
    if (invitation.expiresAt && new Date(invitation.expiresAt) < now) {
      await invitationOps.update(invitation.id, { status: "expired" });
      return res.status(400).json({ message: "Invitation has expired" });
    }

    const user = await userOps.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Associate user with the team and apply limits/role/access from invitation
    const updatedUser = await userOps.update(user.id, {
      teamId: invitation.teamId,
      teamRole: invitation.teamRole || "member",
      maxInventoryItems:
        typeof invitation.maxInventoryItems === "number"
          ? invitation.maxInventoryItems
          : user.maxInventoryItems ?? null,
      allowedPages:
        Array.isArray(invitation.allowedPages) && invitation.allowedPages.length > 0
          ? invitation.allowedPages
          : user.allowedPages ?? null,
      allowedWarehouseIds:
        Array.isArray(invitation.allowedWarehouseIds) &&
        invitation.allowedWarehouseIds.length > 0
          ? invitation.allowedWarehouseIds
          : user.allowedWarehouseIds ?? null,
    });

    await invitationOps.update(invitation.id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: user.id,
    });

    res.json({
      message: "Invitation accepted successfully",
      teamId: updatedUser.teamId,
      teamRole: updatedUser.teamRole,
      maxInventoryItems: updatedUser.maxInventoryItems,
      allowedPages: updatedUser.allowedPages ?? null,
      allowedWarehouseIds: updatedUser.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api`);
  console.log(`\nDemo credentials:`);
  console.log(`  Email: demo@example.com`);
  console.log(`  Password: demo123`);
  console.log(`\n(Or use any email/password for demo)`);
});

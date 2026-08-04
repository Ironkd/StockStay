import { clientOps } from "../db.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerClientRoutes(app, deps) {
  const {
    authenticateToken,
    requireWriteAccess,
    loadCurrentUser,
    userHasPageAccess,
  } = deps;

// ==================== CLIENTS ROUTES ====================

app.get("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    // Allow Clients page access OR inventory page access (pick client when editing invoices)
    const canListClients =
      userHasPageAccess(currentUser, "clients") || userHasPageAccess(currentUser, "inventory");
    if (!canListClients) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    if (!currentUser?.teamId) {
      return res.json([]);
    }

    const clients = await clientOps.findAll(currentUser.teamId);
    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Error fetching clients" });
  }
});

app.get("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ message: "Error fetching client" });
  }
});

app.post("/api/clients", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to create clients." });
    }
    const newClient = await clientOps.create({ ...req.body, teamId: currentUser.teamId });
    res.status(201).json(newClient);
  } catch (error) {
    console.error("Error creating client:", error);
    res.status(500).json({ message: "Error creating client" });
  }
});

app.put("/api/clients/:id", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    const updatedClient = await clientOps.update(req.params.id, req.body);
    res.json(updatedClient);
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ message: "Error updating client" });
  }
});

app.delete("/api/clients/:id", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    try {
      await clientOps.delete(req.params.id);
    } catch (err) {
      if (err?.code === "HAS_HISTORY") {
        return res.status(409).json({ message: err.message, code: "HAS_HISTORY" });
      }
      throw err;
    }
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ message: "Error deleting client" });
  }
});
}

/**
 * Property-level ACL helpers (allowedPropertyIds on UserMembership).
 * Owners and users with null/empty allowedPropertyIds are unrestricted.
 */

/**
 * @param {object|null|undefined} currentUser
 * @returns {string[]|null} null = unrestricted access to all team properties
 */
export function allowedPropertyIdsFor(currentUser) {
  if (!currentUser) return [];
  if (currentUser.teamRole === "owner") return null;
  const ids = currentUser.allowedPropertyIds;
  if (ids == null) return null;
  if (!Array.isArray(ids)) return [];
  if (ids.length === 0) return null;
  return ids.filter((id) => typeof id === "string" && id);
}

/**
 * @param {object} currentUser
 * @param {string} propertyId
 * @returns {boolean}
 */
export function canAccessProperty(currentUser, propertyId) {
  if (!propertyId || typeof propertyId !== "string") return false;
  const allowed = allowedPropertyIdsFor(currentUser);
  if (allowed === null) return true;
  return allowed.includes(propertyId);
}

/**
 * Filter a list of properties (or objects with `.id` / `.propertyId`) to those the user may see.
 * @param {object} currentUser
 * @param {Array<{id?: string, propertyId?: string, property?: {id?: string}}>} rows
 * @param {(row: object) => string|undefined} [getId]
 */
export function filterByPropertyAccess(currentUser, rows, getId) {
  const allowed = allowedPropertyIdsFor(currentUser);
  if (allowed === null) return rows;
  const idSet = new Set(allowed);
  const resolve =
    getId ||
    ((row) => row?.id ?? row?.propertyId ?? row?.property?.id);
  return (rows || []).filter((row) => {
    const id = resolve(row);
    return typeof id === "string" && idSet.has(id);
  });
}

/**
 * Express-friendly check: send 403 and return false if denied.
 * @returns {boolean} true if access is allowed
 */
export function assertPropertyAccess(res, currentUser, propertyId, message) {
  if (canAccessProperty(currentUser, propertyId)) return true;
  res.status(403).json({
    code: "PROPERTY_ACCESS_DENIED",
    message: message || "You do not have access to this property.",
  });
  return false;
}

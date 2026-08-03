/**
 * Block team viewers from mutating team data (NFR-4).
 * Use after authenticateToken. Loads membership context if needed.
 */

/**
 * @param {{ loadCurrentUser: Function }} deps
 */
export function createRequireWriteAccess({ loadCurrentUser }) {
  return async function requireWriteAccess(req, res, next) {
    try {
      const user = req.currentUser || (await loadCurrentUser(req));
      if (!user) {
        return res.status(401).json({ message: "Authentication required." });
      }
      req.currentUser = user;
      if (user.teamRole === "viewer") {
        return res.status(403).json({
          code: "VIEWER_READ_ONLY",
          message: "Viewers have read-only access and cannot make changes.",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

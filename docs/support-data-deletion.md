# Support runbook: user data deletion (alpha)

Alpha Stock Stay has **no self-serve “delete my account” UI**. Deletion requests are handled by support using the platform AdminJS console.

Related: NFR-23 in `docs/requirements.md`. Privacy Policy directs users to `support@stockstay.com`.

---

## Prerequisites

1. Requester emails **support@stockstay.com** (or in-app feedback) asking to delete their account / personal data.
2. Operator has AdminJS access:
   - Server env `SUPER_ADMIN_EMAILS` includes your **User.email** (exact match, case-insensitive).
   - `ADMIN_SESSION_SECRET` or `JWT_SECRET` is set.
   - Open `{API_ORIGIN}/admin` and sign in with that user password.
3. Prefer staging practice before production.

---

## 1. Verify the requester

1. Confirm the request comes from the **account email** (or a known owner email for the org).
2. In AdminJS, open **User** and find the row by email.
3. Note: `User.id`, linked **UserMembership** rows, and whether they own any **Team** / **Organization**.
4. If the email does not match an account, reply asking them to write from the signup email; do not delete on guesswork.

Optional: ask them to confirm org/team name if multiple accounts share a domain.

---

## 2. Decide scope

| Situation | Typical action |
|-----------|----------------|
| Solo Free user, only member of their team | Delete or anonymize **User**; remove **UserMembership**; remove orphan **Team** / org data if nothing else depends on it |
| Member of a shared team (not sole owner) | Remove their **UserMembership** only; keep team data; delete or anonymize **User** if they have no other memberships |
| Sole owner of a team with other members | Transfer ownership or remove other members first; then delete team/user — escalate if unclear |
| Legal hold / dispute | **Do not delete**; escalate |

When in doubt, **archive/anonymize** (clear PII on User: name → “Deleted”, email → `deleted+{id}@invalid.local`, disable login) instead of hard-deleting transactional history (invoices, stock ledger).

---

## 3. AdminJS steps (hard delete — use carefully)

Order matters because of foreign keys. Prefer deleting leaf records or relying on cascade where the schema defines `onDelete`.

1. Sign in at `/admin`.
2. **UserMembership** — filter by `userId`; delete membership rows for this user.
3. Related auth tokens if present as resources (password-reset / verification fields live on User — clearing the User removes them).
4. **User** — delete the user record **or** anonymize fields and set a random unusable password hash.
5. If the user was the only member of a **Team** / **Organization** and the customer wants all business data gone:
   - Review Team-scoped data (Property, Client, Invoice, StockLocation, etc.).
   - Delete team-scoped resources as needed, then **Team**, then **Organization** if empty.
6. Double-check no leftover memberships for that email.

**Cascade warning:** Hard-deleting a Team with large inventory/invoice history can fail on FK constraints or remove operational data other people still need. Prefer membership+user removal when the org continues.

---

## 4. Confirm to the requester

Reply from support:

- Confirm what was removed or anonymized.
- Note that backups may retain data for a limited retention window.
- Ask them to confirm they can no longer sign in.

Example:

> We’ve processed your deletion request for {email}. Your login and personal profile data have been removed [or anonymized]. Organization inventory/invoice history was [removed / retained for remaining members] as discussed. If you need anything else, reply to this email.

---

## 5. Logging

Record in your support tracker: date, requester email, User id, actions taken (delete vs anonymize), operator name. Do not store passwords or full session tokens in tickets.

---

## Out of scope (this alpha)

- Self-serve account deletion button
- Automated GDPR export pack
- Customer-facing “download my data” UI

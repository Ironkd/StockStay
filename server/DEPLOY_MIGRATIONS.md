# Running migrations on deploy

The server **start** command is `node server.js` only. Migrations are **not** run on every deploy so the app can start without waiting on Prisma’s advisory lock (which can timeout with Supabase’s pooler).

**When you add or change schema**, run migrations once:

- **Locally** (with `DATABASE_URL` set to your Supabase DB):
  ```bash
  cd server && npm run migrate:deploy
  ```
- **Railway** (one-off, from your machine):
  ```bash
  railway run npm run migrate:deploy
  ```
  Or in Railway dashboard: your service → **Settings** → **Deploy** → run a one-off command if available.

After that, redeploy or restart the app as usual; the app will use the updated schema.

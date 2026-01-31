# Get the frontend going

Use this from the **project root** (the folder that contains `src/` and `server/`).

---

## 1. Create frontend `.env`

In the **project root** (not inside `server/`), create a file named `.env` with:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

- **Local dev:** Keep the above so the app talks to your backend on port 3000.
- **Production (e.g. Vercel):** Set `VITE_API_BASE_URL` to your deployed API, e.g. `https://your-api.railway.app/api`.

---

## 2. Install dependencies and run

From the **project root** run:

```bash
npm install
npm run dev
```

The app will be at **http://localhost:5173**.

---

## 3. (Optional) One-command script

From the project root you can run:

```bash
./start-frontend.sh
```

That script creates `.env` if missing (with `VITE_API_BASE_URL=http://localhost:3000/api`), runs `npm install`, then `npm run dev`.

---

## 4. Build for production (e.g. Vercel)

```bash
npm run build
```

Output is in `dist/`. On Vercel, set the env var `VITE_API_BASE_URL` to your production API URL; the build will bake it in.

---

## Quick reference

| Command           | Where to run | What it does                    |
|------------------|--------------|----------------------------------|
| `npm install`    | Project root | Install frontend dependencies   |
| `npm run dev`    | Project root | Start dev server (port 5173)    |
| `npm run build`  | Project root | Build for production → `dist/`  |
| `npm run preview`| Project root | Serve `dist/` locally           |

Your backend must be running (e.g. `cd server && npm run dev`) on port 3000 for login and API calls to work.

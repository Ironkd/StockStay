# 🚀 Complete Setup Steps

Run these commands in your terminal, one at a time:

## Step 1: Install Backend Packages

```bash
cd ~/inventory-app/server
npm install
```

This installs all required packages including `@prisma/adapter-pg` and `pg`.

## Step 2: Test Supabase Connection (Optional)

```bash
cd ~/inventory-app/server
node test-supabase-connection.js
```

If this works, you'll see your data counts. If it fails due to network, that's okay - proceed to Step 3.

## Step 3: Start the Backend Server

Open Terminal 1 and run:

```bash
cd ~/inventory-app/server
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3000
```

**Keep this terminal open!**

## Step 4: Start the Frontend

Open a **new terminal window** (Terminal 2) and run:

```bash
cd ~/inventory-app
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

## Step 5: Open Your App

Open your browser and go to:
```
http://localhost:5173
```

## Step 6: Login

Use these credentials:
- **Email:** `demo@example.com`
- **Password:** `demo123`

## ✅ Success!

If you can log in and see your inventory data, everything is working with Supabase!

---

## Troubleshooting

### If backend won't start:
- Make sure you're in `~/inventory-app/server` directory
- Check that `npm install` completed successfully
- Look for error messages in the terminal

### If frontend won't start:
- Make sure you're in `~/inventory-app` directory (not the server folder)
- Check that backend is running first

### If login fails:
- Make sure backend server is running on port 3000
- Check browser console for errors (F12 → Console tab)

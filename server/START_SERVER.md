# Start Your Server

Run these commands:

```bash
cd ~/inventory-app/server
npm run dev
```

## What to Look For

### ✅ Success Signs:
- `✅ Database pool connected successfully`
- `🚀 Server running on http://localhost:3000`
- No errors about "ECONNREFUSED" or "ENOTFOUND"

### ❌ If You See Errors:
- `Error initializing demo user: ECONNREFUSED` → Connection issue
- `Error initializing demo user: ENOTFOUND` → DNS issue
- But if server still says "Server running on http://localhost:3000", try the frontend anyway!

## Even If There's an Error

Sometimes the demo user initialization fails, but the server still works. Try:

1. Keep the backend running (even with errors)
2. Open a NEW terminal
3. Start frontend: `cd ~/inventory-app && npm run dev`
4. Go to http://localhost:5173
5. Try logging in with: `demo@example.com` / `demo123`

If login works, your connection is fine! The error might just be about creating a demo user that already exists.

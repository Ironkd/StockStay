# Setup Instructions (macOS)

Follow these steps to get your StockStay app running on macOS.

## Prerequisites

**⚠️ IMPORTANT: You need Node.js installed first!**

If you get "command not found" errors, see **[INSTALL_NODE.md](./INSTALL_NODE.md)** for detailed installation instructions.

### Quick Check

Test if Node.js is installed:
```bash
node --version
npm --version
```

If you see version numbers, you're good to go! If not, install Node.js first.

### Installing Node.js on macOS

**Easiest Method: Download Installer**
1. Go to https://nodejs.org/
2. Download the LTS version for macOS
3. Install the `.pkg` file
4. **Restart Terminal** after installation

**Or use Homebrew:**
```bash
brew install node
```

**Or use nvm:**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# Then restart terminal and:
nvm install --lts
```

## Step-by-Step Setup

### Step 1: Install Frontend Dependencies

Open **Terminal** (or iTerm2) and navigate to the project directory:
```bash
cd ~/inventory-app
```

Then install dependencies:

```bash
npm install
```

This installs all React frontend dependencies.

### Step 2: Install Backend Dependencies

Navigate to the server directory and install backend dependencies:

```bash
cd server
npm install
cd ..
```

This installs Express.js and other backend dependencies.

### Step 3: Start the Backend Server

Open **Terminal** (or a new Terminal tab/window) and navigate to the server directory:

```bash
cd server
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3000
📝 API available at http://localhost:3000/api
```

**Keep this terminal open** - the backend needs to keep running.

### Step 4: Start the Frontend

Open a **new Terminal tab** (⌘T) or **new Terminal window** (⌘N) - keep the backend running. Navigate to the project root:

```bash
npm run dev
```

You should see:
```
VITE v6.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### Step 5: Open the App

Open your browser and go to:
```
http://localhost:5173
```

### Step 6: Login

Use these credentials to login:
- **Email**: `demo@example.com`
- **Password**: `demo123`

Or use any email/password combination (for demo purposes).

## Troubleshooting (macOS)

### Port Already in Use

If port 3000 or 5173 is already in use:

**Check what's using the port:**
```bash
lsof -i :3000
lsof -i :5173
```

**Kill the process if needed:**
```bash
kill -9 <PID>
```

**Or change the port:**
- Backend: Change `PORT` in `server/server.js` or set `PORT=3001 npm run dev`
- Frontend: Vite will automatically suggest another port

### Permission Errors

If you get permission errors, you might need to use `sudo` (not recommended) or fix permissions:
```bash
sudo chown -R $(whoami) ~/inventory-app
```

### Terminal Tips for macOS

- **New Tab**: ⌘T (Command + T)
- **New Window**: ⌘N (Command + N)
- **Split View**: Right-click tab → Split Tab
- **Copy/Paste**: ⌘C / ⌘V

### Cannot Connect to API

- Make sure the backend is running on port 3000
- Check that `.env` file exists with: `VITE_API_BASE_URL=http://localhost:3000/api`
- Check browser console for CORS errors

### Module Not Found Errors

- Make sure you ran `npm install` in both root and `server/` directories
- Delete `node_modules` and `package-lock.json`, then reinstall

## Quick Commands Reference

**Terminal 1 (Backend):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```

## What's Running Where

- **Backend API**: http://localhost:3000/api
- **Frontend App**: http://localhost:5173
- **Data Storage**: `server/data.json` (auto-created)

## Next Steps After Setup

Once both servers are running:
1. Login to the app
2. Add some inventory items
3. Create clients
4. Generate invoices
5. View the dashboard with charts

Enjoy StockStay! 🎉

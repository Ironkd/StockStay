#!/usr/bin/env bash
# Run from project root. Creates .env if missing, installs deps, starts frontend dev server.

set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Creating .env with VITE_API_BASE_URL=http://localhost:3000/api"
  echo "VITE_API_BASE_URL=http://localhost:3000/api" > .env
fi

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

echo "Starting frontend at http://localhost:5173"
npm run dev

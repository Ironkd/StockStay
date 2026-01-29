#!/bin/bash

echo "🚀 Inventory App - Quick Start Script"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Installing backend packages...${NC}"
cd ~/inventory-app/server
npm install

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  npm install had issues. Continuing anyway...${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Testing Supabase connection...${NC}"
node test-supabase-connection.js

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Open a NEW terminal window"
echo "2. Run: cd ~/inventory-app/server && npm run dev"
echo "3. Open ANOTHER terminal window"
echo "4. Run: cd ~/inventory-app && npm run dev"
echo "5. Open http://localhost:5173 in your browser"
echo "6. Login with: demo@example.com / demo123"

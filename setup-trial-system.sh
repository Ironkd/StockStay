#!/bin/bash
# Quick setup script for the trial system

echo "🎁 Setting up 14-Day Pro Trial System..."
echo ""

# Check if we're in the right directory
if [ ! -d "server" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

cd server

echo "📦 Installing dependencies (if needed)..."
npm install

echo ""
echo "🗄️  Running database migration..."
echo "   Choose one of the following methods:"
echo ""
echo "   Option 1: Using Prisma (recommended)"
echo "   ----------------------------------------"
echo "   npx prisma migrate deploy"
echo ""
echo "   Option 2: Manual SQL (if using Supabase directly)"
echo "   ------------------------------------------------"
echo "   1. Open Supabase SQL Editor"
echo "   2. Copy contents from server/add-trial-fields.sql"
echo "   3. Execute the SQL"
echo ""

read -p "Press Enter to continue with Prisma migration, or Ctrl+C to cancel and run manually..."

npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
else
    echo ""
    echo "⚠️  Migration failed. You may need to run the SQL manually."
    echo "   File: server/add-trial-fields.sql"
fi

echo ""
echo "🚀 Trial system setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Restart your server: npm start"
echo "   2. Check logs for: [TRIAL] Scheduled trial checks..."
echo "   3. Test signup with trial checkbox"
echo ""
echo "📖 For more info, see: TRIAL_SYSTEM.md"

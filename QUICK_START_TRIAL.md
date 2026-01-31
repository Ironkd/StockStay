# 🎁 Quick Start: Free 14-Day Pro Trial

## What You Need to Do

### Step 1: Run the Database Migration ⚡
Open your terminal and run:

```bash
cd server
npx prisma migrate deploy
```

**Alternative:** If you prefer to run SQL manually, copy the contents of `server/add-trial-fields.sql` and run it in your Supabase SQL Editor.

---

### Step 2: Restart Your Server 🚀
```bash
cd server
npm start
```

Look for this message in your logs:
```
[TRIAL] Scheduled trial checks every 60 minutes
```

---

### Step 3: Test It Out 🧪

1. **Go to your signup page** (e.g., `http://localhost:5173/login`)

2. **Click "Sign up"**

3. **You'll see a new checkbox:**
   ```
   🎁 Start 14-day Pro trial (Free)
   Get 10 warehouses, team members & advanced features. 
   No credit card required.
   ```

4. **Check the box and complete signup**

5. **After email verification and login**, you'll have:
   - Pro plan active
   - Up to 10 warehouses available
   - Team member features
   - Advanced reports
   - 14 days to try everything

---

## What Happens After 14 Days?

**Automatically:**
- Your account downgrades to the Free plan
- You keep all your data
- You can still access existing warehouses
- You just can't create more than 1 warehouse

**No action required** - it's completely automatic!

---

## Key Features

✅ **No credit card required** - True free trial  
✅ **Starts immediately** - No waiting period  
✅ **Automatic downgrade** - Set it and forget it  
✅ **Keep your data** - Nothing gets deleted  
✅ **14 full days** - Plenty of time to explore  

---

## Visual Guide

### Signup Page Now Shows:
```
┌─────────────────────────────────────┐
│  Sign Up                            │
├─────────────────────────────────────┤
│  Full name: [____________]          │
│  Email: [____________]              │
│  Password: [____________]           │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ ✓ 🎁 Start 14-day Pro trial  │ │
│  │   (Free)                      │ │
│  │                               │ │
│  │   Get 10 warehouses, team     │ │
│  │   members & advanced          │ │
│  │   features. No credit card    │ │
│  │   required.                   │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Sign Up]                          │
└─────────────────────────────────────┘
```

### Pricing Page Updated:
```
┌────────────────────────────────────┐
│  🔥 Pro                            │
│  🎁 Free 14-day trial              │
│                                    │
│  $39 / month                       │
│  or $390 / year (save $78)         │
│                                    │
│  ✓ Up to 10 warehouses            │
│  ✓ Team members                   │
│  ✓ Advanced reports               │
│                                    │
│  [Start Free Trial]                │
│                                    │
│  No credit card required           │
│  Auto-downgrades to Free after     │
└────────────────────────────────────┘
```

---

## For More Details

📖 **Full Documentation**: See `TRIAL_SYSTEM.md`  
📝 **Implementation Summary**: See `TRIAL_IMPLEMENTATION_SUMMARY.md`  
🔧 **Code Reference**: See `server/trialManager.js`

---

## That's It! 🎉

The trial system is ready to use. Just run the migration, restart your server, and you're good to go!

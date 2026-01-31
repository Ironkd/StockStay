# 14-Day Pro Trial System

This document explains the free trial system implemented for the Pro plan.

## Overview

Users can start a **14-day free trial** of the Pro plan when they sign up. After 14 days, if they haven't upgraded to a paid plan, their account automatically downgrades to the Free plan.

## Features

### For Users
- **No credit card required** - Users can try Pro features without any payment information
- **Automatic activation** - Trial starts immediately when checkbox is selected during signup
- **Grace period** - Full 14 days to try all Pro features
- **Automatic downgrade** - After trial expires, account seamlessly returns to Free plan
- **No data loss** - All inventory data is preserved when downgrading

### Pro Plan Benefits (During Trial)
- Up to **10 warehouses** (vs 1 on Free)
- Team members with role-based permissions
- Advanced reports and analytics
- Inventory value tracking
- Priority support

## How It Works

### 1. User Signs Up with Trial
When signing up, users see a checkbox:
```
🎁 Start 14-day Pro trial (Free)
Get 10 warehouses, team members & advanced features. No credit card required.
```

If checked, the backend:
1. Creates their team account
2. Activates Pro plan features
3. Sets `trialEndsAt` to 14 days from now
4. Sets `isOnTrial` to true

### 2. During Trial Period
- User has full access to Pro features
- Can create up to 10 warehouses
- Can invite team members
- Dashboard shows trial status and days remaining

### 3. Trial Expiration
The system automatically checks for expired trials every hour:
- Finds teams where `trialEndsAt` < current time
- Downgrades them to Free plan
- Sets `maxWarehouses` to 1
- Preserves all existing data

**Important:** Users can keep their existing warehouses even after downgrade, but can't create new ones beyond the free limit.

## Database Schema

### Team Table Fields
```typescript
{
  plan: string,              // "free", "starter", "pro"
  isOnTrial: boolean,        // true if currently on trial
  trialEndsAt: DateTime?,    // When trial expires
  trialPlan: string?,        // Which plan they're trialing (e.g., "pro")
  maxWarehouses: number?     // Enforced warehouse limit
}
```

## API Endpoints

### Start Trial During Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure123",
  "fullName": "John Doe",
  "startProTrial": true
}
```

### Manual Trial Start (Existing Users)
```http
POST /api/team/start-trial
Authorization: Bearer {token}
```

Restrictions:
- Only team owners can start trials
- Team must be on Free plan
- Can't start if already on trial

### Get Team Info (includes trial status)
```http
GET /api/team
Authorization: Bearer {token}

Response:
{
  "team": {
    "plan": "pro",
    "effectivePlan": "pro",
    "isOnTrial": true,
    "trialEndsAt": "2026-02-14T10:30:00.000Z",
    "trialStatus": {
      "isOnTrial": true,
      "trialPlan": "pro",
      "daysRemaining": 12,
      "expired": false
    }
  }
}
```

## Background Jobs

### Trial Expiration Checker
Runs every hour automatically when server starts.

**What it does:**
- Queries for teams with expired trials
- Downgrades each to Free plan
- Logs the action
- Updates warehouse limits

**Configuration:**
```javascript
// In server.js
const TRIAL_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
```

## Frontend Components

### Signup Form
Location: `src/pages/LoginPage.tsx`

Shows trial checkbox with:
- Clear benefits
- "No credit card required" messaging
- Success message when trial is activated

### Pricing Pages
Location: `src/pages/PricingPage.tsx`, `src/pages/LandingPage.tsx`

Updated to show:
- "🎁 Free 14-day trial" badge on Pro plan
- "No credit card required" notice
- "Start Free Trial" button text

## Setup Instructions

### 1. Run Database Migration
```bash
# Using Prisma
cd server
npx prisma migrate dev --name add_trial_fields

# OR manually in Supabase SQL Editor
# Run the contents of server/add-trial-fields.sql
```

### 2. Restart Server
```bash
cd server
npm start
```

The trial checker will start automatically.

### 3. Verify Setup
Check server logs for:
```
[TRIAL] Scheduled trial checks every 60 minutes
```

## Testing

### Test Trial Signup
1. Go to signup page
2. Check "Start 14-day Pro trial"
3. Complete signup and verify email
4. Sign in
5. Check Settings page - should show Pro plan with trial status

### Test Trial Expiration (Manual)
```sql
-- In Supabase SQL Editor
-- Set a trial to expire in the past
UPDATE "Team" 
SET "trialEndsAt" = NOW() - INTERVAL '1 day'
WHERE "id" = 'your-team-id';
```

Then either:
- Wait for hourly check
- Restart server (triggers immediate check)
- Try to create a warehouse (triggers inline check)

### Test Manual Trial Start
```bash
# Using curl or Postman
curl -X POST http://localhost:3000/api/team/start-trial \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Plan Limits

| Feature | Free | Starter | Pro |
|---------|------|---------|-----|
| Warehouses | 1 | 3 | 10 |
| Products | Unlimited | Unlimited | Unlimited |
| Team Members | ❌ | ❌ | ✅ |
| PDF/CSV Export | ❌ | ✅ | ✅ |
| Advanced Reports | ❌ | ❌ | ✅ |
| Value Tracking | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ❌ | ✅ |

## User Experience Flow

```
1. New User Signs Up
   ↓
2. Sees Trial Checkbox → Checks it
   ↓
3. Account Created with Pro Trial
   ↓
4. Verifies Email & Signs In
   ↓
5. Full Pro Access for 14 Days
   ↓
6. Trial Expires (Day 15)
   ↓
7. Auto-Downgrade to Free
   ↓
8. Can Upgrade to Paid Plan Anytime
```

## Monitoring & Logs

The system logs all trial-related actions:

```
[TRIAL] Started 14-day Pro trial for new team abc-123
[TRIAL] Checking for expired trials...
[TRIAL] Found 2 expired trials to downgrade
[TRIAL] Downgraded team xyz-456 (Acme Corp) from trial to free
[TRIAL] Successfully downgraded 2 expired trial(s)
```

## Future Enhancements

Potential improvements:
- Email notifications at 7 days, 3 days, and 1 day before trial ends
- In-app trial countdown banner
- Upgrade prompts when trial is close to expiring
- Analytics on trial conversion rates
- Option to extend trials for specific users (admin feature)

## Support

For questions or issues:
1. Check server logs for trial-related errors
2. Verify database migration ran successfully
3. Ensure background job is running (check logs on server start)
4. Test with manual trial expiration (see Testing section)

# Beer Voucher Tracker - Deployment Guide

## Overview

This guide walks you through deploying the Beer Voucher Tracker to production and setting up the automated 8 AM daily report to MS Teams.

---

## Step 1: Deploy to Production

### Using Manus Management UI

1. Open the **Management UI** (click the panel icon in the top-right corner)
2. Locate the **Publish** button in the header
3. Click **Publish** to deploy the application
4. Choose your deployment options:
   - Use the auto-generated `*.manus.space` domain, OR
   - Configure a custom domain (Settings → Domains)
5. Wait for deployment to complete (typically 2-5 minutes)
6. Once deployed, you'll receive a public URL

### Deployment Details

- **Hosting:** Autoscale (serverless) on Cloud Run
- **Build:** Node.js with Vite frontend + Express backend
- **Database:** MySQL/TiDB (auto-provisioned)
- **Environment:** Production (NODE_ENV=production)

---

## Step 2: Configure MS Teams Webhook

### Prerequisites

- Access to a Microsoft Teams channel where you want reports sent
- Admin role in the Beer Voucher Tracker application

### Setup Steps

1. **Get Webhook URL from MS Teams:**
   - Go to your MS Teams channel
   - Click the three dots (...) next to the channel name
   - Select **Connectors**
   - Search for **Incoming Webhook**
   - Click **Configure**
   - Give it a name (e.g., "Beer Voucher Reports")
   - Optionally upload an image
   - Click **Create**
   - Copy the webhook URL

2. **Configure in Beer Voucher Tracker:**
   - Navigate to your deployed application
   - Click **Admin Settings** (top-right corner)
   - Paste the webhook URL into the "MS Teams Webhook URL" field
   - Click **Save Webhook URL**
   - You should see a success message

### Webhook URL Format

The webhook URL will look like:
```
https://outlook.webhook.office.com/webhookb2/...
```

**Security Note:** Only administrators can view or modify this URL. The webhook URL is encrypted and stored securely in the database.

---

## Step 3: Create the Cron Job

### Using Manus CLI

After deployment, create the scheduled task using the Manus CLI:

```bash
manus-config schedule --help
```

### Create Daily Report Job

Run this command to create the 8 AM UTC daily report job:

```bash
manus-config schedule --create \
  --name "daily-voucher-report-8am" \
  --cron "0 0 8 * * *" \
  --url "https://your-deployed-domain.manus.space/api/scheduled/daily-report"
```

**Replace `your-deployed-domain` with your actual domain.**

### Cron Expression Explanation

- `0 0 8 * * *` = Every day at 8:00 AM UTC
  - Second: 0
  - Minute: 0
  - Hour: 8 (UTC)
  - Day of Month: * (any)
  - Month: * (any)
  - Day of Week: * (any)

### Timezone Note

The cron job runs in **UTC timezone**. If you need a different time:
- For 8 AM Bangkok (UTC+7): Use `0 0 1 * * *` (1 AM UTC)
- For 8 AM Singapore (UTC+8): Use `0 0 0 * * *` (midnight UTC)
- For 8 AM London (UTC+0): Use `0 0 8 * * *` (8 AM UTC)

---

## Step 4: Verify Cron Job Setup

### Check Job Status

1. Open Management UI → Settings → Schedules
2. Look for "daily-voucher-report-8am" in the list
3. Verify:
   - Status: **Active**
   - Next Execution: Shows the next scheduled time
   - Last Execution: Shows previous run details

### Manual Test

To test the cron job before waiting for 8 AM:

1. Go to Management UI → Schedules
2. Find the "daily-voucher-report-8am" job
3. Click **Run Now** button
4. Check your MS Teams channel for the report

### Verify Report Delivery

The report will appear in your MS Teams channel as an Adaptive Card with:
- **Daily Voucher Report** - [Date]
- Today's metrics: Total Issued, Posted Bills, Cancelled, Utilization Rate
- 7-Day Trend Analysis: Average Utilization, Total Issued (7 days), Total Posted (7 days)

---

## Step 5: Monitor & Troubleshoot

### Checking Execution Logs

1. Open Management UI → Settings → Schedules
2. Click on the "daily-voucher-report-8am" job
3. View execution history and any error messages

### Common Issues

#### Issue: Webhook URL not configured
- **Error:** Report skipped - "no-webhook"
- **Solution:** Go to Admin Settings and configure the MS Teams webhook URL

#### Issue: No data for the day
- **Error:** Report skipped - "no-data"
- **Solution:** Ensure voucher data was entered for the previous day

#### Issue: Cron job not running
- **Error:** Job status shows "Inactive"
- **Solution:** 
  - Verify the job exists: `manus-config schedule --list`
  - Re-create the job if needed
  - Check that the deployment URL is correct

#### Issue: MS Teams webhook returns 401/403
- **Error:** "MS Teams webhook failed: 401 Unauthorized"
- **Solution:**
  - Verify the webhook URL is correct
  - Regenerate the webhook URL in MS Teams
  - Update the URL in Admin Settings

---

## Data Flow

```
Daily Voucher Entry (User)
    ↓
Database (voucher_records table)
    ↓
8 AM UTC Cron Job Trigger
    ↓
Fetch Previous Day's Data
    ↓
Calculate 7-Day Trends
    ↓
Format MS Teams Adaptive Card
    ↓
POST to Webhook URL
    ↓
MS Teams Channel Notification
```

---

## API Endpoint Reference

### Scheduled Report Handler

**Endpoint:** `POST /api/scheduled/daily-report`

**Authentication:** Cron-only (requires valid Heartbeat token)

**Response:**
```json
{
  "ok": true,
  "message": "Report sent for 2026-07-21",
  "stats": {
    "totalIssued": 100,
    "postedBills": 60,
    "cancelled": 40,
    "utilizationRate": 60
  }
}
```

---

## Rollback & Maintenance

### Disable Cron Job

```bash
manus-config schedule --pause "daily-voucher-report-8am"
```

### Resume Cron Job

```bash
manus-config schedule --resume "daily-voucher-report-8am"
```

### Delete Cron Job

```bash
manus-config schedule --delete "daily-voucher-report-8am"
```

### Update Cron Time

Delete the old job and create a new one with the desired time.

---

## Support & Documentation

- **Manus Help:** https://help.manus.im
- **Vite Documentation:** https://vite.dev
- **Express.js:** https://expressjs.com
- **tRPC:** https://trpc.io
- **MS Teams Webhooks:** https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using

---

## Security Considerations

1. **Webhook URL:** Only admins can view/modify. Stored encrypted in database.
2. **Authentication:** Cron jobs authenticated via Manus Heartbeat tokens.
3. **Data:** Only previous day's data is compiled (no real-time data exposure).
4. **Access Control:** Admin-only settings page prevents unauthorized configuration changes.

---

## Next Steps

After deployment:

1. ✅ Deploy to production
2. ✅ Configure MS Teams webhook
3. ✅ Create cron job
4. ✅ Verify job runs successfully
5. 📊 Start tracking voucher data daily
6. 📈 Monitor analytics and trends
7. 📋 Receive automated reports every morning

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0

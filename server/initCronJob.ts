/**
 * Script to initialize the daily 8 AM cron job
 * Run this once after deployment to set up the scheduled task
 * 
 * Usage: npx tsx server/initCronJob.ts
 */

import { createHeartbeatJob } from "./_core/heartbeat";
import { ENV } from "./_core/env";

async function initializeCronJob() {
  try {
    console.log("Initializing 8 AM daily report cron job...");

    // Get session token from environment
    const sessionToken = process.env.CRON_INIT_TOKEN || "";
    if (!sessionToken) {
      console.error(
        "Error: CRON_INIT_TOKEN environment variable is required"
      );
      console.log(
        "This script should be run with proper authentication context"
      );
      process.exit(1);
    }

    // Create the cron job
    const job = await createHeartbeatJob(
      {
        name: "daily-voucher-report-8am",
        cron: "0 0 8 * * *", // 8:00 AM UTC every day (6-field format: sec min hour dom mon dow)
        path: "/api/scheduled/daily-report",
        description: "Daily voucher report sent to MS Teams at 8 AM UTC",
      },
      sessionToken
    );

    console.log("✓ Cron job created successfully!");
    console.log(`  Task UID: ${job.taskUid}`);
    console.log(`  Next execution: ${job.nextExecutionAt}`);
    console.log(
      "\nThe cron job will run every day at 8:00 AM UTC and send a report to MS Teams."
    );
  } catch (error) {
    console.error("Failed to initialize cron job:", error);
    process.exit(1);
  }
}

initializeCronJob();

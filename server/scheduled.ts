import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";

/**
 * Handler for scheduled daily report to MS Teams
 * Triggered every day at 8:00 AM UTC
 * Compiles previous day's voucher statistics and posts to MS Teams
 */
export async function handleDailyReportHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Get previous day's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Get yesterday's voucher record
    const yesterdayRecord = await db.getVoucherRecordByDate(yesterdayStr);

    if (!yesterdayRecord) {
      return res.json({
        ok: true,
        skipped: "no-data",
        message: `No data found for ${yesterdayStr}`,
      });
    }

    // Get MS Teams webhook URL
    const webhookSetting = await db.getSetting("ms_teams_webhook");
    if (!webhookSetting?.value) {
      return res.json({
        ok: true,
        skipped: "no-webhook",
        message: "MS Teams webhook URL not configured",
      });
    }

    // Get last 7 days for trend analysis
    const sevenDaysAgo = new Date(yesterday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
    const last7Days = await db.getVoucherRecordsByDateRange(
      sevenDaysAgoStr,
      yesterdayStr
    );

    // Calculate trend
    const avgUtilization =
      last7Days.length > 0
        ? Math.round(
            last7Days.reduce((sum, r) => sum + r.utilizationRate, 0) /
              last7Days.length
          )
        : 0;

    const totalIssued7Days = last7Days.reduce((sum, r) => sum + r.totalIssued, 0);
    const totalPosted7Days = last7Days.reduce((sum, r) => sum + r.postedBills, 0);

    // Format MS Teams message (Adaptive Card format)
    const teamsMessage = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: `Daily Voucher Report - ${yesterdayStr}`,
      themeColor: "0078D4",
      sections: [
        {
          activityTitle: `Daily Voucher Report - ${yesterdayStr}`,
          activitySubtitle: "Beer Voucher Tracker",
          facts: [
            {
              name: "Total Issued",
              value: yesterdayRecord.totalIssued.toString(),
            },
            {
              name: "Posted Bills",
              value: yesterdayRecord.postedBills.toString(),
            },
            {
              name: "Cancelled",
              value: yesterdayRecord.cancelled.toString(),
            },
            {
              name: "Utilization Rate",
              value: `${yesterdayRecord.utilizationRate}%`,
            },
          ],
          markdown: true,
        },
        {
          activityTitle: "7-Day Trend Analysis",
          facts: [
            {
              name: "Average Utilization (7 days)",
              value: `${avgUtilization}%`,
            },
            {
              name: "Total Issued (7 days)",
              value: totalIssued7Days.toString(),
            },
            {
              name: "Total Posted (7 days)",
              value: totalPosted7Days.toString(),
            },
            {
              name: "Records in Period",
              value: last7Days.length.toString(),
            },
          ],
          markdown: true,
        },
      ],
    };

    // Post to MS Teams
    const response = await fetch(webhookSetting.value, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(teamsMessage),
    });

    if (!response.ok) {
      throw new Error(
        `MS Teams webhook failed: ${response.status} ${response.statusText}`
      );
    }

    return res.json({
      ok: true,
      message: `Report sent for ${yesterdayStr}`,
      stats: {
        totalIssued: yesterdayRecord.totalIssued,
        postedBills: yesterdayRecord.postedBills,
        cancelled: yesterdayRecord.cancelled,
        utilizationRate: yesterdayRecord.utilizationRate,
      },
    });
  } catch (error) {
    console.error("[Scheduled] Daily report error:", error);
    const err = error instanceof Error ? error : new Error(String(error));
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: {
        url: req.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

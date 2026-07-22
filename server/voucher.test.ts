import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "admin" | "user" = "user"): {
  ctx: TrpcContext;
} {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("voucher procedures", () => {
  it("validates formula: totalIssued = postedBills + cancelled", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Valid case
    await expect(
      caller.voucher.upsert({
        date: "2026-07-22",
        totalIssued: 100,
        postedBills: 60,
        cancelled: 40,
      })
    ).resolves.toEqual({ success: true });

    // Invalid case: 100 !== 60 + 50
    await expect(
      caller.voucher.upsert({
        date: "2026-07-22",
        totalIssued: 100,
        postedBills: 60,
        cancelled: 50,
      })
    ).rejects.toThrow("Total issued must equal posted bills + cancelled");
  });

  it("requires authentication for upsert", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.voucher.upsert({
        date: "2026-07-22",
        totalIssued: 100,
        postedBills: 60,
        cancelled: 40,
      })
    ).rejects.toThrow();
  });

  it("allows public access to getToday", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    // Should not throw
    await expect(caller.voucher.getToday()).resolves.toBeDefined();
  });

  it("allows public access to getByDateRange", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    // Should not throw
    await expect(
      caller.voucher.getByDateRange({
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      })
    ).resolves.toBeDefined();
  });

  it("requires admin to delete voucher record", async () => {
    const { ctx: userCtx } = createAuthContext("user");
    const caller = appRouter.createCaller(userCtx);

    await expect(
      caller.voucher.delete({ date: "2026-07-22" })
    ).rejects.toThrow("Only admins can delete voucher records");
  });

  it("allows admin to delete voucher record", async () => {
    const { ctx: adminCtx } = createAuthContext("admin");
    const caller = appRouter.createCaller(adminCtx);

    // Should not throw (even if record doesn't exist)
    await expect(
      caller.voucher.delete({ date: "2026-07-22" })
    ).resolves.toEqual({ success: true });
  });
});

describe("settings procedures", () => {
  it("requires admin role to set settings", async () => {
    const { ctx: userCtx } = createAuthContext("user");
    const caller = appRouter.createCaller(userCtx);

    await expect(
      caller.settings.set({
        key: "ms_teams_webhook",
        value: "https://hooks.slack.com/...",
      })
    ).rejects.toThrow("Only admins can update settings");
  });

  it("allows admin to set settings", async () => {
    const { ctx: adminCtx } = createAuthContext("admin");
    const caller = appRouter.createCaller(adminCtx);

    // Should not throw
    await expect(
      caller.settings.set({
        key: "ms_teams_webhook",
        value: "https://hooks.slack.com/...",
      })
    ).resolves.toEqual({ success: true });
  });

  it("requires admin to get settings", async () => {
    const { ctx: userCtx } = createAuthContext("user");
    const caller = appRouter.createCaller(userCtx);

    // User should not be able to get settings
    await expect(
      caller.settings.get({ key: "ms_teams_webhook" })
    ).rejects.toThrow("Only admins can read settings");
  });

  it("allows admin to get settings", async () => {
    const { ctx: adminCtx } = createAuthContext("admin");
    const caller = appRouter.createCaller(adminCtx);

    // Should not throw
    await expect(
      caller.settings.get({ key: "ms_teams_webhook" })
    ).resolves.toBeDefined();
  });

  it("requires admin to delete settings", async () => {
    const { ctx: userCtx } = createAuthContext("user");
    const caller = appRouter.createCaller(userCtx);

    await expect(
      caller.settings.delete({ key: "ms_teams_webhook" })
    ).rejects.toThrow("Only admins can delete settings");
  });

  it("allows admin to delete settings", async () => {
    const { ctx: adminCtx } = createAuthContext("admin");
    const caller = appRouter.createCaller(adminCtx);

    // Should not throw
    await expect(
      caller.settings.delete({ key: "ms_teams_webhook" })
    ).resolves.toEqual({ success: true });
  });
});

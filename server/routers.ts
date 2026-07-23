import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { sdk } from "./_core/sdk";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(2, "Tên hiển thị phải từ 2 ký tự trở lên"),
          restaurant: z.string().optional(),
          emailOrUsername: z.string().min(3, "Tên đăng nhập hoặc email từ 3 ký tự trở lên"),
          password: z.string().min(4, "Mật khẩu phải từ 4 ký tự trở lên"),
          role: z.enum(["admin", "user"]).default("user"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await db.registerAccount(input);
          const sessionToken = await sdk.createSessionToken(user.openId, {
            name: user.name || input.name,
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

          return { success: true, user, token: sessionToken };
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message || "Đăng ký thất bại",
          });
        }
      }),
    loginWithCredentials: publicProcedure
      .input(
        z.object({
          emailOrUsername: z.string().min(1, "Vui lòng nhập tên đăng nhập hoặc email"),
          password: z.string().min(1, "Vui lòng nhập mật khẩu"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await db.loginAccount(input);
          const sessionToken = await sdk.createSessionToken(user.openId, {
            name: user.name || user.openId,
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

          return { success: true, user, token: sessionToken };
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message || "Đăng nhập thất bại",
          });
        }
      }),
    loginAs: publicProcedure
      .input(
        z.object({
          name: z.string().min(1),
          role: z.enum(["admin", "user"]).default("admin"),
          email: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const email = input.email || `${input.role}@beervoucher.vn`;
        const openId = `user-${input.role}-${input.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

        await db.upsertUser({
          openId,
          name: input.name,
          email,
          loginMethod: "direct",
          role: input.role,
          lastSignedIn: new Date(),
        });

        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, token: sessionToken };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  voucher: router({
    /**
     * Get today's voucher record
     */
    getToday: publicProcedure.query(async () => {
      const today = new Date().toISOString().split("T")[0];
      const record = await db.getVoucherRecordByDate(today);
      return record || null;
    }),

    /**
     * Create or update voucher record for a date
     */
    upsert: protectedProcedure
      .input(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          totalIssued: z.number().int().min(0),
          postedBills: z.number().int().min(0),
          cancelled: z.number().int().min(0),
          potatoCoupons: z.number().int().min(0).optional(),
          beerCoupons: z.number().int().min(0).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Validate formula: totalIssued = postedBills + cancelled
        if (input.totalIssued !== input.postedBills + input.cancelled) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Tổng coupon (${input.totalIssued}) phải bằng Coupon khoai tây + Coupon beer + Coupon hủy (${input.postedBills + input.cancelled})`,
          });
        }

        await db.upsertVoucherRecord(input);
        return { success: true };
      }),

    /**
     * Get voucher records within date range
     */
    getByDateRange: publicProcedure
      .input(
        z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .query(async ({ input }) => {
        return db.getVoucherRecordsByDateRange(
          input.startDate,
          input.endDate
        );
      }),

    /**
     * Get previous day's voucher record (for reporting)
     */
    getPreviousDay: publicProcedure.query(async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      return db.getVoucherRecordByDate(yesterdayStr);
    }),

    /**
     * Delete voucher record for a date (admin only)
     */
    delete: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ input, ctx }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admins can delete voucher records",
          });
        }

        await db.deleteVoucherRecord(input.date);
        return { success: true };
      }),
  }),

  settings: router({
    /**
     * Get setting by key (admin only for security)
     */
    get: protectedProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input, ctx }) => {
        // Only admins can read settings
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admins can read settings",
          });
        }
        return db.getSetting(input.key);
      }),

    /**
     * Update setting (admin only)
     */
    set: protectedProcedure
      .input(
        z.object({
          key: z.string(),
          value: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admins can update settings",
          });
        }

        await db.setSetting(input.key, input.value);
        return { success: true };
      }),

    /**
     * Delete setting (admin only)
     */
    delete: protectedProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admins can delete settings",
          });
        }

        await db.deleteSetting(input.key);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

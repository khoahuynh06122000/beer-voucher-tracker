// server/_core/app.ts
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var voucherRecords = mysqlTable("voucher_records", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(),
  // YYYY-MM-DD format
  totalIssued: int("total_issued").notNull().default(0),
  postedBills: int("posted_bills").notNull().default(0),
  cancelled: int("cancelled").notNull().default(0),
  potatoCoupons: int("potato_coupons").notNull().default(0),
  beerCoupons: int("beer_coupons").notNull().default(0),
  utilizationRate: int("utilization_rate").notNull().default(0),
  // percentage 0-100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
var inMemoryUsers = /* @__PURE__ */ new Map();
var inMemoryVouchers = /* @__PURE__ */ new Map();
var inMemorySettings = /* @__PURE__ */ new Map();
function seedSampleVouchers() {
  if (inMemoryVouchers.size > 0) return;
  const today = /* @__PURE__ */ new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const potatoCoupons = 70 + Math.floor(Math.sin(i) * 15);
    const beerCoupons = 80 + i % 3 * 10;
    const cancelled = 5 + Math.floor(Math.random() * 8);
    const postedBills = potatoCoupons + beerCoupons;
    const totalIssued = postedBills + cancelled;
    const utilizationRate = Math.round(postedBills / totalIssued * 100);
    inMemoryVouchers.set(dateStr, {
      id: i + 1,
      date: dateStr,
      totalIssued,
      postedBills,
      cancelled,
      potatoCoupons,
      beerCoupons,
      utilizationRate,
      createdAt: d,
      updatedAt: d
    });
  }
}
var DB_TIMEOUT_MS = 2e3;
async function withTimeout(promise, ms = DB_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`Database query timed out after ${ms}ms`)), ms)
    )
  ]);
}
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const existing = inMemoryUsers.get(user.openId);
  const now = /* @__PURE__ */ new Date();
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "admin");
  const updatedUser = {
    id: existing?.id ?? inMemoryUsers.size + 1,
    openId: user.openId,
    name: user.name ?? existing?.name ?? null,
    email: user.email ?? existing?.email ?? null,
    loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
    role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now
  };
  inMemoryUsers.set(user.openId, updatedUser);
  const db = await getDb();
  if (!db) return;
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await withTimeout(
      db.insert(users).values(values).onDuplicateKeyUpdate({
        set: updateSet
      })
    );
  } catch (error) {
    console.warn("[Database] Failed to upsert user to MySQL, falling back to in-memory:", error);
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (db) {
    try {
      const result = await withTimeout(
        db.select().from(users).where(eq(users.openId, openId)).limit(1)
      );
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting user, falling back to in-memory:", err);
    }
  }
  return inMemoryUsers.get(openId);
}
async function getVoucherRecordByDate(date) {
  seedSampleVouchers();
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(voucherRecords).where(eq(voucherRecords.date, date)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting voucher record, falling back to in-memory:", err);
    }
  }
  return inMemoryVouchers.get(date);
}
async function upsertVoucherRecord(data) {
  seedSampleVouchers();
  const potatoCoupons = data.potatoCoupons ?? 0;
  const beerCoupons = data.beerCoupons ?? 0;
  const utilizationRate = data.totalIssued > 0 ? Math.round(data.postedBills / data.totalIssued * 100) : 0;
  const existing = inMemoryVouchers.get(data.date);
  const now = /* @__PURE__ */ new Date();
  const record = {
    id: existing?.id ?? inMemoryVouchers.size + 1,
    date: data.date,
    totalIssued: data.totalIssued,
    postedBills: data.postedBills,
    cancelled: data.cancelled,
    potatoCoupons,
    beerCoupons,
    utilizationRate,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  inMemoryVouchers.set(data.date, record);
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(voucherRecords).values({
      date: data.date,
      totalIssued: data.totalIssued,
      postedBills: data.postedBills,
      cancelled: data.cancelled,
      potatoCoupons,
      beerCoupons,
      utilizationRate
    }).onDuplicateKeyUpdate({
      set: {
        totalIssued: data.totalIssued,
        postedBills: data.postedBills,
        cancelled: data.cancelled,
        potatoCoupons,
        beerCoupons,
        utilizationRate
      }
    });
  } catch (err) {
    console.warn("[Database] MySQL error upserting voucher, saved to in-memory:", err);
  }
}
async function getVoucherRecordsByDateRange(startDate, endDate) {
  seedSampleVouchers();
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(voucherRecords).where(
        and(
          gte(voucherRecords.date, startDate),
          lte(voucherRecords.date, endDate)
        )
      ).orderBy(desc(voucherRecords.date));
      return result;
    } catch (err) {
      console.warn("[Database] MySQL error getting range, falling back to in-memory:", err);
    }
  }
  const list = [];
  for (const record of inMemoryVouchers.values()) {
    if (record.date >= startDate && record.date <= endDate) {
      list.push(record);
    }
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
async function getSetting(key) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting setting, falling back to in-memory:", err);
    }
  }
  return inMemorySettings.get(key);
}
async function setSetting(key, value) {
  const existing = inMemorySettings.get(key);
  const now = /* @__PURE__ */ new Date();
  inMemorySettings.set(key, {
    id: existing?.id ?? inMemorySettings.size + 1,
    key,
    value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({
      set: { value }
    });
  } catch (err) {
    console.warn("[Database] MySQL error setting config, saved to in-memory:", err);
  }
}
async function deleteSetting(key) {
  inMemorySettings.delete(key);
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete(settings).where(eq(settings.key, key));
  } catch (err) {
    console.warn("[Database] MySQL error deleting setting, removed from in-memory:", err);
  }
}
async function deleteVoucherRecord(date) {
  inMemoryVouchers.delete(date);
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete(voucherRecords).where(eq(voucherRecords.date, date));
  } catch (err) {
    console.warn("[Database] MySQL error deleting voucher, removed from in-memory:", err);
  }
}
var registeredAccounts = /* @__PURE__ */ new Map();
function hashPassword(password) {
  return crypto.createHash("sha256").update(`beervoucher_${password}_salt`).digest("hex");
}
function initializeDefaultAccounts() {
  const defaultAccounts = [
    {
      username: "lehoibia",
      name: "Thu Ng\xE2n L\u1EC5 H\u1ED9i Bia",
      restaurant: "L\u1EC5 H\u1ED9i Bia",
      role: "user",
      password: "123"
    },
    {
      username: "1901",
      name: "Thu Ng\xE2n Nh\xE0 H\xE0ng 1901",
      restaurant: "1901",
      role: "user",
      password: "123"
    },
    {
      username: "beerplaza",
      name: "Thu Ng\xE2n Beer Plaza",
      restaurant: "Beer Plaza",
      role: "user",
      password: "123"
    },
    {
      username: "admin",
      name: "Ban Qu\u1EA3n L\xFD - Admin",
      restaurant: "Ban Qu\u1EA3n L\xFD",
      role: "admin",
      password: "123"
    }
  ];
  for (const acc of defaultAccounts) {
    const key = acc.username.toLowerCase().trim();
    if (!registeredAccounts.has(key)) {
      registeredAccounts.set(key, {
        openId: `reg-${key}`,
        name: acc.name,
        restaurant: acc.restaurant,
        emailOrUsername: acc.username,
        passwordHash: hashPassword(acc.password),
        role: acc.role
      });
    }
  }
}
initializeDefaultAccounts();
async function registerAccount(input) {
  const normalizedKey = input.emailOrUsername.toLowerCase().trim();
  if (registeredAccounts.has(normalizedKey)) {
    throw new Error("T\xE0i kho\u1EA3n ho\u1EB7c Email n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD. Vui l\xF2ng ch\u1ECDn tab \u0110\u0103ng Nh\u1EADp.");
  }
  const role = input.role || "user";
  const restaurant = input.restaurant || "L\u1EC5 H\u1ED9i Bia";
  const displayName = input.name.includes(" - ") ? input.name : `${input.name} (${restaurant})`;
  const openId = `reg-${normalizedKey.replace(/[^a-z0-9]/g, "-")}`;
  const passwordHash = hashPassword(input.password);
  registeredAccounts.set(normalizedKey, {
    openId,
    name: displayName,
    restaurant,
    emailOrUsername: input.emailOrUsername,
    passwordHash,
    role
  });
  await upsertUser({
    openId,
    name: displayName,
    email: input.emailOrUsername.includes("@") ? input.emailOrUsername : `${normalizedKey}@beervoucher.vn`,
    loginMethod: "credentials",
    role,
    lastSignedIn: /* @__PURE__ */ new Date()
  });
  const user = await getUserByOpenId(openId);
  if (!user) {
    throw new Error("Kh\xF4ng th\u1EC3 t\u1EA1o t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng.");
  }
  return user;
}
async function loginAccount(input) {
  const normalizedKey = input.emailOrUsername.toLowerCase().trim();
  initializeDefaultAccounts();
  const account = registeredAccounts.get(normalizedKey);
  if (!account) {
    throw new Error(`T\xE0i kho\u1EA3n "${input.emailOrUsername}" ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD. Vui l\xF2ng ch\u1ECDn tab \u0110\u0103ng K\xFD.`);
  }
  const hash = hashPassword(input.password);
  if (account.passwordHash !== hash) {
    throw new Error("M\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c. Vui l\xF2ng th\u1EED l\u1EA1i.");
  }
  await upsertUser({
    openId: account.openId,
    name: account.name,
    role: account.role,
    lastSignedIn: /* @__PURE__ */ new Date()
  });
  const user = await getUserByOpenId(account.openId);
  if (!user) {
    throw new Error("\u0110\u0103ng nh\u1EADp th\u1EA5t b\u1EA1i.");
  }
  return user;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret || "beer-voucher-secret-jwt-key-2026-default-key";
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "beer-voucher-app",
        name: options.name || "Qu\u1EA3n Tr\u1ECB Vi\xEAn (Admin)"
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.warn("[Auth] Failed to sync user from OAuth, using session fallback:", error);
        await upsertUser({
          openId: session.openId,
          name: session.name || "User",
          email: null,
          loginMethod: "preview",
          role: "admin",
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(session.openId);
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/auth/dev-login", async (req, res) => {
    try {
      const openId = "dev-admin-user";
      await upsertUser({
        openId,
        name: "Qu\u1EA3n Tr\u1ECB Vi\xEAn (Admin)",
        email: "admin@beervoucher.vn",
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: "Qu\u1EA3n Tr\u1ECB Vi\xEAn (Admin)",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Auth] Dev login error details:", error);
      res.status(500).json({
        error: "Dev login failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    register: publicProcedure.input(
      z2.object({
        name: z2.string().min(2, "T\xEAn hi\u1EC3n th\u1ECB ph\u1EA3i t\u1EEB 2 k\xFD t\u1EF1 tr\u1EDF l\xEAn"),
        restaurant: z2.string().optional(),
        emailOrUsername: z2.string().min(3, "T\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c email t\u1EEB 3 k\xFD t\u1EF1 tr\u1EDF l\xEAn"),
        password: z2.string().min(4, "M\u1EADt kh\u1EA9u ph\u1EA3i t\u1EEB 4 k\xFD t\u1EF1 tr\u1EDF l\xEAn"),
        role: z2.enum(["admin", "user"]).default("user")
      })
    ).mutation(async ({ input, ctx }) => {
      try {
        const user = await registerAccount(input);
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || input.name,
          expiresInMs: ONE_YEAR_MS
        });
        try {
          const cookieOptions = getSessionCookieOptions(ctx.req);
          if (ctx.res && typeof ctx.res.cookie === "function") {
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
          } else if (ctx.res && typeof ctx.res.setHeader === "function") {
            ctx.res.setHeader(
              "Set-Cookie",
              `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(ONE_YEAR_MS / 1e3)}`
            );
          }
        } catch (cErr) {
          console.warn("[Auth API] Warning setting cookie during register (non-fatal):", cErr);
        }
        return { success: true, user, token: sessionToken };
      } catch (err) {
        console.error("[Auth API] Register error:", err);
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: err.message || "\u0110\u0103ng k\xFD th\u1EA5t b\u1EA1i"
        });
      }
    }),
    loginWithCredentials: publicProcedure.input(
      z2.object({
        emailOrUsername: z2.string().min(1, "Vui l\xF2ng nh\u1EADp t\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c email"),
        password: z2.string().min(1, "Vui l\xF2ng nh\u1EADp m\u1EADt kh\u1EA9u")
      })
    ).mutation(async ({ input, ctx }) => {
      console.log(`[Auth API] Login attempt for: "${input.emailOrUsername}"`);
      try {
        const user = await loginAccount(input);
        console.log(`[Auth API] Login successful for user openId: "${user.openId}"`);
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || user.openId,
          expiresInMs: ONE_YEAR_MS
        });
        try {
          const cookieOptions = getSessionCookieOptions(ctx.req);
          if (ctx.res && typeof ctx.res.cookie === "function") {
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
          } else if (ctx.res && typeof ctx.res.setHeader === "function") {
            ctx.res.setHeader(
              "Set-Cookie",
              `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(ONE_YEAR_MS / 1e3)}`
            );
          }
        } catch (cookieErr) {
          console.warn("[Auth API] Warning setting cookie (non-fatal):", cookieErr);
        }
        return { success: true, user, token: sessionToken };
      } catch (err) {
        console.error(`[Auth API] Login failed for "${input.emailOrUsername}":`, err.message || err);
        if (err instanceof TRPCError3) {
          throw err;
        }
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: err.message || "T\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c.",
          cause: err
        });
      }
    }),
    loginAs: publicProcedure.input(
      z2.object({
        name: z2.string().min(1),
        role: z2.enum(["admin", "user"]).default("admin"),
        email: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      try {
        const email = input.email || `${input.role}@beervoucher.vn`;
        const openId = `user-${input.role}-${input.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        await upsertUser({
          openId,
          name: input.name,
          email,
          loginMethod: "direct",
          role: input.role,
          lastSignedIn: /* @__PURE__ */ new Date()
        });
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS
        });
        try {
          const cookieOptions = getSessionCookieOptions(ctx.req);
          if (ctx.res && typeof ctx.res.cookie === "function") {
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
          } else if (ctx.res && typeof ctx.res.setHeader === "function") {
            ctx.res.setHeader(
              "Set-Cookie",
              `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(ONE_YEAR_MS / 1e3)}`
            );
          }
        } catch (cErr) {
          console.warn("[Auth API] Warning setting cookie during loginAs (non-fatal):", cErr);
        }
        return { success: true, token: sessionToken };
      } catch (err) {
        console.error("[Auth API] loginAs error:", err);
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: err.message || "\u0110\u0103ng nh\u1EADp nhanh th\u1EA5t b\u1EA1i"
        });
      }
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      try {
        const cookieOptions = getSessionCookieOptions(ctx.req);
        if (ctx.res && typeof ctx.res.clearCookie === "function") {
          ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        } else if (ctx.res && typeof ctx.res.setHeader === "function") {
          ctx.res.setHeader(
            "Set-Cookie",
            `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`
          );
        }
      } catch (cErr) {
        console.warn("[Auth API] Logout cookie clearing warning:", cErr);
      }
      return {
        success: true
      };
    })
  }),
  voucher: router({
    /**
     * Get today's voucher record
     */
    getToday: publicProcedure.query(async () => {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const record = await getVoucherRecordByDate(today);
      return record || null;
    }),
    /**
     * Get voucher record for a specific date
     */
    getByDate: publicProcedure.input(z2.object({ date: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(async ({ input }) => {
      const record = await getVoucherRecordByDate(input.date);
      return record || null;
    }),
    /**
     * Create or update voucher record for a date
     */
    upsert: protectedProcedure.input(
      z2.object({
        date: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        totalIssued: z2.number().int().min(0),
        postedBills: z2.number().int().min(0),
        cancelled: z2.number().int().min(0),
        potatoCoupons: z2.number().int().min(0).optional(),
        beerCoupons: z2.number().int().min(0).optional()
      })
    ).mutation(async ({ input }) => {
      if (input.totalIssued !== input.postedBills + input.cancelled) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: `T\u1ED5ng coupon (${input.totalIssued}) ph\u1EA3i b\u1EB1ng Coupon khoai t\xE2y + Coupon beer + Coupon h\u1EE7y (${input.postedBills + input.cancelled})`
        });
      }
      await upsertVoucherRecord(input);
      return { success: true };
    }),
    /**
     * Get voucher records within date range
     */
    getByDateRange: publicProcedure.input(
      z2.object({
        startDate: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
    ).query(async ({ input }) => {
      return getVoucherRecordsByDateRange(
        input.startDate,
        input.endDate
      );
    }),
    /**
     * Get previous day's voucher record (for reporting)
     */
    getPreviousDay: publicProcedure.query(async () => {
      const today = /* @__PURE__ */ new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      return getVoucherRecordByDate(yesterdayStr);
    }),
    /**
     * Delete voucher record for a date (admin only)
     */
    delete: protectedProcedure.input(z2.object({ date: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Only admins can delete voucher records"
        });
      }
      await deleteVoucherRecord(input.date);
      return { success: true };
    })
  }),
  settings: router({
    /**
     * Get setting by key (admin only for security)
     */
    get: protectedProcedure.input(z2.object({ key: z2.string() })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Only admins can read settings"
        });
      }
      return getSetting(input.key);
    }),
    /**
     * Update setting (admin only)
     */
    set: protectedProcedure.input(
      z2.object({
        key: z2.string(),
        value: z2.string()
      })
    ).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Only admins can update settings"
        });
      }
      await setSetting(input.key, input.value);
      return { success: true };
    }),
    /**
     * Delete setting (admin only)
     */
    delete: protectedProcedure.input(z2.object({ key: z2.string() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Only admins can delete settings"
        });
      }
      await deleteSetting(input.key);
      return { success: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/scheduled.ts
async function handleDailyReportHandler(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }
    const today = /* @__PURE__ */ new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayRecord = await getVoucherRecordByDate(yesterdayStr);
    if (!yesterdayRecord) {
      return res.json({
        ok: true,
        skipped: "no-data",
        message: `No data found for ${yesterdayStr}`
      });
    }
    const webhookSetting = await getSetting("ms_teams_webhook");
    if (!webhookSetting?.value) {
      return res.json({
        ok: true,
        skipped: "no-webhook",
        message: "MS Teams webhook URL not configured"
      });
    }
    const sevenDaysAgo = new Date(yesterday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
    const last7Days = await getVoucherRecordsByDateRange(
      sevenDaysAgoStr,
      yesterdayStr
    );
    const avgUtilization = last7Days.length > 0 ? Math.round(
      last7Days.reduce((sum, r) => sum + r.utilizationRate, 0) / last7Days.length
    ) : 0;
    const totalIssued7Days = last7Days.reduce((sum, r) => sum + r.totalIssued, 0);
    const totalPosted7Days = last7Days.reduce((sum, r) => sum + r.postedBills, 0);
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
              value: yesterdayRecord.totalIssued.toString()
            },
            {
              name: "Posted Bills",
              value: yesterdayRecord.postedBills.toString()
            },
            {
              name: "Cancelled",
              value: yesterdayRecord.cancelled.toString()
            },
            {
              name: "Utilization Rate",
              value: `${yesterdayRecord.utilizationRate}%`
            }
          ],
          markdown: true
        },
        {
          activityTitle: "7-Day Trend Analysis",
          facts: [
            {
              name: "Average Utilization (7 days)",
              value: `${avgUtilization}%`
            },
            {
              name: "Total Issued (7 days)",
              value: totalIssued7Days.toString()
            },
            {
              name: "Total Posted (7 days)",
              value: totalPosted7Days.toString()
            },
            {
              name: "Records in Period",
              value: last7Days.length.toString()
            }
          ],
          markdown: true
        }
      ]
    };
    const response = await fetch(webhookSetting.value, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(teamsMessage)
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
        utilizationRate: yesterdayRecord.utilizationRate
      }
    });
  } catch (error) {
    console.error("[Scheduled] Daily report error:", error);
    const err = error instanceof Error ? error : new Error(String(error));
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: {
        url: req.url,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
}

// server/_core/app.ts
function createExpressApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  app2.use((req, _res, next) => {
    if (process.env.NODE_ENV !== "production" || req.url.includes("/api/trpc")) {
      console.log(`[Express] ${req.method} ${req.url} (originalUrl: ${req.originalUrl})`);
    }
    if (req.originalUrl && (req.url === "/api" || req.url === "/api/" || req.url.startsWith("/api?"))) {
      req.url = req.originalUrl;
    }
    next();
  });
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.post("/api/scheduled/daily-report", handleDailyReportHandler);
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`[tRPC Server Error] Path "${path}":`, error);
    }
  });
  app2.use("/api/trpc", trpcMiddleware);
  app2.use("/trpc", trpcMiddleware);
  app2.all("/api/*", (req, res) => {
    console.warn(`[Express API Fallback 404] Unmatched API path: ${req.method} ${req.url}`);
    res.status(404).json([
      {
        error: {
          message: `API route "${req.url}" not found.`,
          code: -32601,
          data: { code: "NOT_FOUND", httpStatus: 404 }
        }
      }
    ]);
  });
  app2.use((err, _req, res, _next) => {
    console.error("[Express Global Error Handler]:", err);
    res.status(err.status || err.statusCode || 500).json([
      {
        error: {
          message: err.message || "Internal Server Error",
          code: -32603,
          data: { code: "INTERNAL_SERVER_ERROR", httpStatus: err.status || 500 }
        }
      }
    ]);
  });
  return app2;
}

// api/index.ts
var app = createExpressApp();
var index_default = app;
export {
  index_default as default
};

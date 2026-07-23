import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";
import { InsertUser, User, users, voucherRecords, VoucherRecord, settings, Setting } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// In-memory fallbacks when MySQL database is not accessible
const inMemoryUsers = new Map<string, User>();
const inMemoryVouchers = new Map<string, VoucherRecord>();
const inMemorySettings = new Map<string, Setting>();

// Seed sample data for in-memory mode if empty
function seedSampleVouchers() {
  if (inMemoryVouchers.size > 0) return;
  
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    
    // Create realistic mock voucher numbers
    const potatoCoupons = 70 + Math.floor(Math.sin(i) * 15);
    const beerCoupons = 80 + (i % 3) * 10;
    const cancelled = 5 + Math.floor(Math.random() * 8);
    const postedBills = potatoCoupons + beerCoupons;
    const totalIssued = postedBills + cancelled;
    const utilizationRate = Math.round((postedBills / totalIssued) * 100);

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
      updatedAt: d,
    });
  }
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  // Update in-memory
  const existing = inMemoryUsers.get(user.openId);
  const now = new Date();
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "admin");
  const updatedUser: User = {
    id: existing?.id ?? inMemoryUsers.size + 1,
    openId: user.openId,
    name: user.name ?? existing?.name ?? null,
    email: user.email ?? existing?.email ?? null,
    loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
    role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
  inMemoryUsers.set(user.openId, updatedUser);

  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.warn("[Database] Failed to upsert user to MySQL, falling back to in-memory:", error);
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting user, falling back to in-memory:", err);
    }
  }

  return inMemoryUsers.get(openId);
}

/**
 * Get or create voucher record for a specific date
 */
export async function getVoucherRecordByDate(date: string): Promise<VoucherRecord | undefined> {
  seedSampleVouchers();

  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(voucherRecords)
        .where(eq(voucherRecords.date, date))
        .limit(1);

      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting voucher record, falling back to in-memory:", err);
    }
  }

  return inMemoryVouchers.get(date);
}

/**
 * Create or update voucher record
 */
export async function upsertVoucherRecord(data: {
  date: string;
  totalIssued: number;
  postedBills: number;
  cancelled: number;
  potatoCoupons?: number;
  beerCoupons?: number;
}) {
  seedSampleVouchers();

  const potatoCoupons = data.potatoCoupons ?? 0;
  const beerCoupons = data.beerCoupons ?? 0;

  const utilizationRate =
    data.totalIssued > 0
      ? Math.round((data.postedBills / data.totalIssued) * 100)
      : 0;

  const existing = inMemoryVouchers.get(data.date);
  const now = new Date();
  const record: VoucherRecord = {
    id: existing?.id ?? inMemoryVouchers.size + 1,
    date: data.date,
    totalIssued: data.totalIssued,
    postedBills: data.postedBills,
    cancelled: data.cancelled,
    potatoCoupons,
    beerCoupons,
    utilizationRate,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  inMemoryVouchers.set(data.date, record);

  const db = await getDb();
  if (!db) return;

  try {
    await db
      .insert(voucherRecords)
      .values({
        date: data.date,
        totalIssued: data.totalIssued,
        postedBills: data.postedBills,
        cancelled: data.cancelled,
        potatoCoupons,
        beerCoupons,
        utilizationRate,
      })
      .onDuplicateKeyUpdate({
        set: {
          totalIssued: data.totalIssued,
          postedBills: data.postedBills,
          cancelled: data.cancelled,
          potatoCoupons,
          beerCoupons,
          utilizationRate,
        },
      });
  } catch (err) {
    console.warn("[Database] MySQL error upserting voucher, saved to in-memory:", err);
  }
}

/**
 * Get voucher records within date range
 */
export async function getVoucherRecordsByDateRange(
  startDate: string,
  endDate: string
): Promise<VoucherRecord[]> {
  seedSampleVouchers();

  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(voucherRecords)
        .where(
          and(
            gte(voucherRecords.date, startDate),
            lte(voucherRecords.date, endDate)
          )
        )
        .orderBy(desc(voucherRecords.date));

      return result;
    } catch (err) {
      console.warn("[Database] MySQL error getting range, falling back to in-memory:", err);
    }
  }

  const list: VoucherRecord[] = [];
  for (const record of inMemoryVouchers.values()) {
    if (record.date >= startDate && record.date <= endDate) {
      list.push(record);
    }
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Get setting by key
 */
export async function getSetting(key: string): Promise<Setting | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);

      if (result.length > 0) return result[0];
    } catch (err) {
      console.warn("[Database] MySQL error getting setting, falling back to in-memory:", err);
    }
  }

  return inMemorySettings.get(key);
}

/**
 * Update or create setting
 */
export async function setSetting(key: string, value: string) {
  const existing = inMemorySettings.get(key);
  const now = new Date();
  inMemorySettings.set(key, {
    id: existing?.id ?? inMemorySettings.size + 1,
    key,
    value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  const db = await getDb();
  if (!db) return;

  try {
    await db
      .insert(settings)
      .values({ key, value })
      .onDuplicateKeyUpdate({
        set: { value },
      });
  } catch (err) {
    console.warn("[Database] MySQL error setting config, saved to in-memory:", err);
  }
}

/**
 * Delete setting by key
 */
export async function deleteSetting(key: string) {
  inMemorySettings.delete(key);

  const db = await getDb();
  if (!db) return;

  try {
    await db.delete(settings).where(eq(settings.key, key));
  } catch (err) {
    console.warn("[Database] MySQL error deleting setting, removed from in-memory:", err);
  }
}

/**
 * Delete voucher record by date
 */
export async function deleteVoucherRecord(date: string) {
  inMemoryVouchers.delete(date);

  const db = await getDb();
  if (!db) return;

  try {
    await db.delete(voucherRecords).where(eq(voucherRecords.date, date));
  } catch (err) {
    console.warn("[Database] MySQL error deleting voucher, removed from in-memory:", err);
  }
}

// In-memory accounts with password and restaurant department
interface RegisteredAccount {
  openId: string;
  name: string;
  restaurant: string;
  emailOrUsername: string;
  passwordHash: string;
  role: "admin" | "user";
}

const registeredAccounts = new Map<string, RegisteredAccount>();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(`beervoucher_${password}_salt`).digest("hex");
}

// Pre-seed default accounts for the 3 restaurants and admin
function initializeDefaultAccounts() {
  const defaultAccounts: Array<{
    username: string;
    name: string;
    restaurant: string;
    role: "admin" | "user";
    password: string;
  }> = [
    {
      username: "lehoibia",
      name: "Thu Ngân Lễ Hội Bia",
      restaurant: "Lễ Hội Bia",
      role: "user",
      password: "123",
    },
    {
      username: "1901",
      name: "Thu Ngân Nhà Hàng 1901",
      restaurant: "1901",
      role: "user",
      password: "123",
    },
    {
      username: "beerplaza",
      name: "Thu Ngân Beer Plaza",
      restaurant: "Beer Plaza",
      role: "user",
      password: "123",
    },
    {
      username: "admin",
      name: "Ban Quản Lý - Admin",
      restaurant: "Ban Quản Lý",
      role: "admin",
      password: "123",
    },
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
        role: acc.role,
      });
    }
  }
}

// Initialize on module load
initializeDefaultAccounts();

export async function registerAccount(input: {
  name: string;
  restaurant?: string;
  emailOrUsername: string;
  password: string;
  role?: "admin" | "user";
}): Promise<User> {
  const normalizedKey = input.emailOrUsername.toLowerCase().trim();
  if (registeredAccounts.has(normalizedKey)) {
    throw new Error("Tài khoản hoặc Email này đã được đăng ký. Vui lòng chọn tab Đăng Nhập.");
  }

  const role = input.role || "user";
  const restaurant = input.restaurant || "Lễ Hội Bia";
  const displayName = input.name.includes(" - ") ? input.name : `${input.name} (${restaurant})`;
  const openId = `reg-${normalizedKey.replace(/[^a-z0-9]/g, "-")}`;
  const passwordHash = hashPassword(input.password);

  registeredAccounts.set(normalizedKey, {
    openId,
    name: displayName,
    restaurant,
    emailOrUsername: input.emailOrUsername,
    passwordHash,
    role,
  });

  await upsertUser({
    openId,
    name: displayName,
    email: input.emailOrUsername.includes("@") ? input.emailOrUsername : `${normalizedKey}@beervoucher.vn`,
    loginMethod: "credentials",
    role,
    lastSignedIn: new Date(),
  });

  const user = await getUserByOpenId(openId);
  if (!user) {
    throw new Error("Không thể tạo tài khoản người dùng.");
  }

  return user;
}

export async function loginAccount(input: {
  emailOrUsername: string;
  password: string;
}): Promise<User> {
  const normalizedKey = input.emailOrUsername.toLowerCase().trim();
  
  // Ensure default accounts exist
  initializeDefaultAccounts();

  const account = registeredAccounts.get(normalizedKey);

  if (!account) {
    throw new Error(`Tài khoản "${input.emailOrUsername}" chưa được đăng ký. Vui lòng chọn tab Đăng Ký.`);
  }

  const hash = hashPassword(input.password);
  if (account.passwordHash !== hash) {
    throw new Error("Mật khẩu không chính xác. Vui lòng thử lại.");
  }

  await upsertUser({
    openId: account.openId,
    name: account.name,
    role: account.role,
    lastSignedIn: new Date(),
  });

  const user = await getUserByOpenId(account.openId);
  if (!user) {
    throw new Error("Đăng nhập thất bại.");
  }

  return user;
}




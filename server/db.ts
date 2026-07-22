import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
    const totalIssued = 150 + Math.floor(Math.sin(i) * 30) + (i % 3) * 10;
    const cancelled = 5 + Math.floor(Math.random() * 8);
    const postedBills = totalIssued - cancelled;
    const utilizationRate = Math.round((postedBills / totalIssued) * 100);

    inMemoryVouchers.set(dateStr, {
      id: i + 1,
      date: dateStr,
      totalIssued,
      postedBills,
      cancelled,
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
}) {
  seedSampleVouchers();

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
        utilizationRate,
      })
      .onDuplicateKeyUpdate({
        set: {
          totalIssued: data.totalIssued,
          postedBills: data.postedBills,
          cancelled: data.cancelled,
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




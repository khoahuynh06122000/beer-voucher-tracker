import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

export interface UserProfile {
  uid: string;
  username: string;
  role: "restaurant" | "admin";
  restaurantName: string;
  email: string;
  createdAt?: string;
}

export interface VoucherRecord {
  id?: string;
  date: string;
  restaurantId: string;
  restaurantName?: string;
  potatoCoupons: number;
  beerCoupons: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  utilizationRate: number;
  billNumber?: string;
  billImages?: string[];
  updatedAt?: string;
  createdBy?: string;
}

// Preset user map for auto-seeding
export const PRESET_USERS: Record<string, Omit<UserProfile, "uid">> = {
  lehoibia: {
    username: "lehoibia",
    role: "restaurant",
    restaurantName: "Lê Hội Bia",
    email: "lehoibia@beervoucher.app",
  },
  "1901": {
    username: "1901",
    role: "restaurant",
    restaurantName: "Nhà Hàng 1901",
    email: "1901@beervoucher.app",
  },
  beerplaza: {
    username: "beerplaza",
    role: "restaurant",
    restaurantName: "Beer Plaza",
    email: "beerplaza@beervoucher.app",
  },
  maisonkayser: {
    username: "maisonkayser",
    role: "restaurant",
    restaurantName: "Maison Kayser",
    email: "maisonkayser@beervoucher.app",
  },
  admin: {
    username: "admin",
    role: "admin",
    restaurantName: "Ban Quản Lý",
    email: "admin@beervoucher.app",
  },
};

/**
 * Fetch or initialize user profile in Firestore `users` collection
 */
export async function getUserProfile(uid: string, email?: string): Promise<UserProfile> {
  let matchedKey = "admin";
  if (email) {
    const usernameFromEmail = email.split("@")[0].toLowerCase();
    if (PRESET_USERS[usernameFromEmail]) {
      matchedKey = usernameFromEmail;
    } else {
      matchedKey = usernameFromEmail;
    }
  }

  const preset = PRESET_USERS[matchedKey] || {
    username: email ? email.split("@")[0] : "user",
    role: matchedKey === "admin" ? "admin" : "restaurant",
    restaurantName: matchedKey === "admin" ? "Ban Quản Lý" : `Nhà Hàng ${email ? email.split("@")[0] : "Lê Hội Bia"}`,
    email: email || "",
  };

  const defaultProfile: UserProfile = {
    uid,
    ...preset,
    email: email || preset.email,
    createdAt: new Date().toISOString(),
  };

  try {
    const userRef = doc(db, "users", uid);
    const fetchPromise = getDoc(userRef);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

    const snap = await Promise.race([fetchPromise, timeoutPromise]);

    if (snap && snap.exists()) {
      return snap.data() as UserProfile;
    }

    setDoc(userRef, defaultProfile).catch(() => {});
    return defaultProfile;
  } catch (error) {
    console.error("Error fetching user profile from Firestore:", error);
    return defaultProfile;
  }
}

function cleanUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  });
  return newObj;
}

/**
 * Save user profile explicitly
 */
export async function createUserProfile(uid: string, profile: Omit<UserProfile, "uid">): Promise<UserProfile> {
  const userRef = doc(db, "users", uid);
  const newProfile: UserProfile = {
    uid,
    ...profile,
    createdAt: new Date().toISOString(),
  };
  await setDoc(userRef, cleanUndefinedFields(newProfile) as UserProfile);
  return newProfile;
}

/**
 * Get local date string in YYYY-MM-DD format based on client local timezone
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get voucher for a specific restaurant and date.
 * If isAdmin or restaurantId === 'all', aggregates vouchers across all restaurants for that date.
 */
export async function getVoucherByDate(
  restaurantId: string,
  date: string,
  isAdmin: boolean = false
): Promise<VoucherRecord | null> {
  try {
    const vouchersRef = collection(db, "vouchers");

    if (isAdmin || restaurantId === "all") {
      const q = query(vouchersRef, where("date", "==", date));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      let totalPotato = 0;
      let totalBeer = 0;
      let totalCancelled = 0;
      let totalPostedBills = 0;
      let totalIssued = 0;
      let allBillImages: string[] = [];
      let allBillNumbers: string[] = [];

      querySnap.forEach((doc) => {
        const data = doc.data() as VoucherRecord;
        const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
        const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
        totalPotato += potato;
        totalBeer += beer;
        totalCancelled += data.cancelled || 0;
        totalPostedBills += data.postedBills || (potato + beer);
        totalIssued += data.totalIssued || (potato + beer + (data.cancelled || 0));
        if (data.billImages && Array.isArray(data.billImages)) {
          allBillImages.push(...data.billImages);
        }
        if (data.billNumber) {
          allBillNumbers.push(`${data.restaurantName || data.restaurantId}: ${data.billNumber}`);
        }
      });

      const rate = totalIssued > 0 ? Math.round((totalPostedBills / totalIssued) * 100) : 0;

      return {
        id: `all_${date}`,
        date,
        restaurantId: "all",
        restaurantName: "Tất Cả Nhà Hàng",
        potatoCoupons: totalPotato,
        beerCoupons: totalBeer,
        cancelled: totalCancelled,
        postedBills: totalPostedBills,
        totalIssued,
        utilizationRate: rate,
        billNumber: allBillNumbers.length > 0 ? allBillNumbers.join("; ") : undefined,
        billImages: allBillImages.length > 0 ? allBillImages : undefined,
      };
    } else {
      const docId = `${restaurantId}_${date}`;
      const docRef = doc(db, "vouchers", docId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data() as VoucherRecord;
        const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
        const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
        return {
          id: snap.id,
          ...data,
          potatoCoupons: potato,
          beerCoupons: beer,
        } as VoucherRecord;
      }

      // Fallback query by restaurantId and date
      const q = query(
        vouchersRef,
        where("restaurantId", "==", restaurantId),
        where("date", "==", date)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const firstDoc = querySnap.docs[0];
        const data = firstDoc.data() as VoucherRecord;
        const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
        const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
        return {
          id: firstDoc.id,
          ...data,
          potatoCoupons: potato,
          beerCoupons: beer,
        } as VoucherRecord;
      }

      return null;
    }
  } catch (error) {
    console.error("Error getting voucher by date:", error);
    return null;
  }
}

/**
 * Get today's voucher
 */
export async function getTodayVoucher(
  restaurantId: string,
  isAdmin: boolean = false
): Promise<VoucherRecord | null> {
  const today = getLocalDateString();
  return getVoucherByDate(restaurantId, today, isAdmin);
}

/**
 * Get vouchers in a date range (index-safe in-memory filtering)
 */
export async function getVouchersByDateRange(
  restaurantId: string | null,
  startDate: string,
  endDate: string
): Promise<VoucherRecord[]> {
  try {
    const vouchersRef = collection(db, "vouchers");
    const q = query(
      vouchersRef,
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );

    const querySnap = await getDocs(q);
    const results: VoucherRecord[] = [];
    querySnap.forEach((d) => {
      const data = d.data() as VoucherRecord;
      if (!restaurantId || restaurantId === "all" || data.restaurantId === restaurantId) {
        const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
        const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
        results.push({
          id: d.id,
          ...data,
          potatoCoupons: potato,
          beerCoupons: beer,
        });
      }
    });

    // Sort by date descending
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Error getting vouchers by date range:", error);
    return [];
  }
}

/**
 * Get aggregated voucher metrics over a date range
 */
export async function getAggregatedVoucherByDateRange(
  restaurantId: string | null,
  startDate: string,
  endDate: string
): Promise<VoucherRecord | null> {
  const records = await getVouchersByDateRange(restaurantId, startDate, endDate);
  if (!records || records.length === 0) {
    return null;
  }

  let totalPotato = 0;
  let totalBeer = 0;
  let totalBakery = 0;
  let totalCancelled = 0;
  let totalPostedBills = 0;
  let totalIssued = 0;
  let allBillImages: string[] = [];
  let allBillNumbers: string[] = [];

  records.forEach((data) => {
    const potato = data.potatoCoupons ?? Math.round((data.postedBills || 0) / 2);
    const beer = data.beerCoupons ?? ((data.postedBills || 0) - potato);
    const bakery = data.bakeryCoupons ?? 0;
    const cancelled = data.cancelled || 0;
    const posted = data.postedBills || (potato + beer + bakery);
    const issued = data.totalIssued || (potato + beer + bakery + cancelled);

    totalPotato += potato;
    totalBeer += beer;
    totalBakery += bakery;
    totalCancelled += cancelled;
    totalPostedBills += posted;
    totalIssued += issued;

    if (data.billImages && Array.isArray(data.billImages)) {
      allBillImages.push(...data.billImages);
    }
    if (data.billNumber) {
      allBillNumbers.push(`${data.restaurantName || data.restaurantId} (${data.date}): ${data.billNumber}`);
    }
  });

  const rate = totalIssued > 0 ? Math.round((totalPostedBills / totalIssued) * 100) : 0;

  return {
    id: `aggregate_${startDate}_${endDate}`,
    date: startDate === endDate ? startDate : `${startDate} → ${endDate}`,
    restaurantId: restaurantId || "all",
    restaurantName: !restaurantId || restaurantId === "all" ? "Tất Cả Nhà Hàng" : restaurantId,
    potatoCoupons: totalPotato,
    beerCoupons: totalBeer,
    bakeryCoupons: totalBakery,
    cancelled: totalCancelled,
    postedBills: totalPostedBills,
    totalIssued: totalIssued,
    utilizationRate: rate,
    billNumber: allBillNumbers.length > 0 ? allBillNumbers.join("; ") : undefined,
    billImages: allBillImages.length > 0 ? allBillImages : undefined,
  };
}

/**
 * Upsert (create or update) a voucher record
 */
export async function upsertVoucher(data: {
  date: string;
  restaurantId: string;
  restaurantName?: string;
  potatoCoupons: number;
  beerCoupons: number;
  bakeryCoupons?: number;
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  createdBy: string;
  billNumber?: string;
  billImages?: string[];
}): Promise<VoucherRecord> {
  const docId = `${data.restaurantId}_${data.date}`;
  const docRef = doc(db, "vouchers", docId);

  const utilizationRate =
    data.totalIssued > 0
      ? Math.round((data.postedBills / data.totalIssued) * 100)
      : 0;

  const record: VoucherRecord = {
    ...data,
    utilizationRate,
    updatedAt: new Date().toISOString(),
  };

  const cleanedRecord = cleanUndefinedFields(record) as VoucherRecord;

  await setDoc(docRef, cleanedRecord, { merge: true });
  return { id: docId, ...cleanedRecord };
}

/**
 * Append new bill images to an existing voucher record
 */
export async function appendBillImagesToVoucher(
  restaurantId: string,
  date: string,
  newImages: string[],
  billNumber?: string
): Promise<VoucherRecord> {
  const docId = `${restaurantId}_${date}`;
  const docRef = doc(db, "vouchers", docId);
  const snap = await getDoc(docRef);

  let existingImages: string[] = [];
  let currentRecord: Partial<VoucherRecord> = {};

  if (snap.exists()) {
    currentRecord = snap.data() as VoucherRecord;
    existingImages = currentRecord.billImages || [];
  }

  const updatedImages = [...existingImages, ...newImages];
  const updatedData: Partial<VoucherRecord> = {
    billImages: updatedImages,
    updatedAt: new Date().toISOString(),
  };

  if (billNumber) {
    updatedData.billNumber = billNumber;
  }

  const cleanedData = cleanUndefinedFields(updatedData as Record<string, any>);

  await setDoc(docRef, cleanedData, { merge: true });
  return { ...currentRecord, ...cleanedData, id: docId } as VoucherRecord;
}

/**
 * Settings CRUD (MS Teams Webhook)
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const docRef = doc(db, "settings", key);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data().value || null;
    }
    return null;
  } catch (error) {
    console.error("Error fetching setting:", error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const docRef = doc(db, "settings", key);
  await setDoc(docRef, { value, updatedAt: new Date().toISOString() });
}

export interface RestaurantStatus {
  restaurantId: string;
  restaurantName: string;
  hasUpdated: boolean;
  postedBills?: number;
  totalIssued?: number;
  utilizationRate?: number;
  hasImageProof?: boolean;
  imageCount?: number;
  billNumber?: string;
  updatedAt?: string;
}

/**
 * Check which restaurants have missing reports for a target date (defaults to yesterday)
 */
export async function checkUnupdatedRestaurants(checkDate?: string): Promise<{
  checkDate: string;
  missing: RestaurantStatus[];
  updated: RestaurantStatus[];
  totalRestaurants: number;
}> {
  let dateToQuery = checkDate;
  if (!dateToQuery) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateToQuery = getLocalDateString(yesterday);
  }

  const restaurantKeys = Object.keys(PRESET_USERS).filter((k) => k !== "admin");

  const missing: RestaurantStatus[] = [];
  const updated: RestaurantStatus[] = [];

  for (const key of restaurantKeys) {
    const preset = PRESET_USERS[key];
    try {
      const record = await getVoucherByDate(key, dateToQuery, false);
      if (record && record.updatedAt) {
        const imageCount = (record.billImages && Array.isArray(record.billImages)) ? record.billImages.length : 0;
        updated.push({
          restaurantId: key,
          restaurantName: preset.restaurantName,
          hasUpdated: true,
          postedBills: record.postedBills ?? 0,
          totalIssued: record.totalIssued ?? 0,
          utilizationRate: record.utilizationRate ?? 0,
          hasImageProof: imageCount > 0,
          imageCount,
          billNumber: record.billNumber,
          updatedAt: record.updatedAt,
        });
      } else {
        missing.push({
          restaurantId: key,
          restaurantName: preset.restaurantName,
          hasUpdated: false,
        });
      }
    } catch (e) {
      missing.push({
        restaurantId: key,
        restaurantName: preset.restaurantName,
        hasUpdated: false,
      });
    }
  }

  return {
    checkDate: dateToQuery,
    missing,
    updated,
    totalRestaurants: restaurantKeys.length,
  };
}

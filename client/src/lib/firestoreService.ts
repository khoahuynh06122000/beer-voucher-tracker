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
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  utilizationRate: number;
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
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    await setDoc(userRef, defaultProfile).catch(() => {});
    return defaultProfile;
  } catch (error) {
    console.error("Error fetching user profile from Firestore:", error);
    return defaultProfile;
  }
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
  await setDoc(userRef, newProfile);
  return newProfile;
}

/**
 * Get voucher for a specific restaurant and date
 */
export async function getVoucherByDate(
  restaurantId: string,
  date: string
): Promise<VoucherRecord | null> {
  try {
    const docId = `${restaurantId}_${date}`;
    const docRef = doc(db, "vouchers", docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as VoucherRecord;
    }

    // Fallback query
    const q = query(
      collection(db, "vouchers"),
      where("restaurantId", "==", restaurantId),
      where("date", "==", date)
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const firstDoc = querySnap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as VoucherRecord;
    }

    return null;
  } catch (error) {
    console.error("Error getting voucher by date:", error);
    return null;
  }
}

/**
 * Get today's voucher
 */
export async function getTodayVoucher(restaurantId: string): Promise<VoucherRecord | null> {
  const today = new Date().toISOString().split("T")[0];
  return getVoucherByDate(restaurantId, today);
}

/**
 * Get vouchers in a date range
 */
export async function getVouchersByDateRange(
  restaurantId: string | null,
  startDate: string,
  endDate: string
): Promise<VoucherRecord[]> {
  try {
    const vouchersRef = collection(db, "vouchers");
    let q;

    if (restaurantId && restaurantId !== "all") {
      q = query(
        vouchersRef,
        where("restaurantId", "==", restaurantId),
        where("date", ">=", startDate),
        where("date", "<=", endDate)
      );
    } else {
      q = query(
        vouchersRef,
        where("date", ">=", startDate),
        where("date", "<=", endDate)
      );
    }

    const querySnap = await getDocs(q);
    const results: VoucherRecord[] = [];
    querySnap.forEach((d) => {
      results.push({ id: d.id, ...d.data() } as VoucherRecord);
    });

    // Sort by date descending
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Error getting vouchers by date range:", error);
    return [];
  }
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
  cancelled: number;
  postedBills: number;
  totalIssued: number;
  createdBy: string;
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

  await setDoc(docRef, record, { merge: true });
  return { id: docId, ...record };
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

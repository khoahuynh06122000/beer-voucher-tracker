/**
 * Mọi lời gọi tới /api đều phải đi qua đây để tự gắn Firebase ID token.
 *
 * Trước đây client gọi /api/db trần trụi, và endpoint đó cũng không kiểm tra gì
 * — ai biết URL là lấy được dữ liệu. Từ nay server bắt buộc có token hợp lệ.
 */
import { auth } from "./firebase";

/** Lấy ID token hiện tại. Firebase tự làm mới khi sắp hết hạn. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  try {
    return await u.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super("Chưa đăng nhập.");
    this.name = "NotSignedInError";
  }
}

/**
 * fetch() có kèm Authorization. Nếu server trả 401 (token vừa hết hạn) thì xin
 * token mới một lần rồi thử lại — tránh bắt người dùng đăng nhập lại giữa chừng
 * khi đang nhập liệu.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new NotSignedInError();

  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` },
  });

  let res = await fetch(input, withAuth(token));
  if (res.status === 401) {
    const fresh = await getIdToken(true);
    if (fresh && fresh !== token) res = await fetch(input, withAuth(fresh));
  }
  return res;
}

/** Gọi API trả JSON, ném lỗi kèm thông báo tiếng Việt của server. */
export async function authFetchJson<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(input, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* server trả không phải JSON */
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Lỗi máy chủ (HTTP ${res.status})`);
  }
  return data as T;
}

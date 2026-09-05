/**
 * Trang duyệt tài khoản — chỉ chủ hệ thống thấy.
 *
 * Hiện mọi email đã từng đăng nhập Google, nhà hàng họ xin vào, và cho duyệt /
 * từ chối / thu hồi. Người đang chờ được xếp lên đầu để không bị bỏ sót.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, ShieldCheck, UserX, Users } from "lucide-react";
import { authFetchJson } from "@/lib/authFetch";

interface ApiUser {
  email: string;
  role: "super_admin" | "admin" | "restaurant" | "pending";
  restaurantId?: string;
  restaurantName?: string | null;
  requestedRestaurantId?: string;
  requestedRestaurantName?: string | null;
  displayName?: string;
  firstLoginAt?: string;
  lastLoginAt?: string;
  approvedBy?: string;
}

const ROLE_LABEL: Record<ApiUser["role"], string> = {
  super_admin: "Chủ hệ thống",
  admin: "Ban Quản Lý",
  restaurant: "Nhà hàng",
  pending: "Chờ duyệt",
};

const fmt = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function UserApproval() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  /** Nhà hàng admin chọn đè lên nguyện vọng của người dùng. */
  const [override, setOverride] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetchJson<{ users: ApiUser[]; restaurants: { id: string; name: string }[] }>(
        "/api/admin/users"
      );
      setUsers(data.users || []);
      setRestaurants(data.restaurants || []);
      setForbidden(false);
    } catch (e: any) {
      // Không phải chủ hệ thống thì ẩn hẳn khối này đi cho gọn.
      if (String(e?.message || "").includes("chủ hệ thống")) setForbidden(true);
      else toast.error(e?.message || "Không tải được danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (email: string, action: "approve" | "reject" | "revoke", extra?: Record<string, any>) => {
    setBusy(email);
    try {
      const data = await authFetchJson<{ success: boolean; message?: string }>("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action, ...extra }),
      });
      if (data.success) {
        toast.success(data.message || "Đã cập nhật quyền.");
        await load();
      } else {
        toast.error(data.message || "Không cập nhật được.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Lỗi cập nhật quyền.");
    } finally {
      setBusy(null);
    }
  };

  if (forbidden) return null;

  const pendingCount = users.filter((u) => u.role === "pending").length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
      <div className="p-4 border-b border-border/60 flex items-center gap-3 flex-wrap">
        <div
          className={`p-2 rounded-xl shrink-0 ${
            pendingCount > 0
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground">
            Tài khoản truy cập
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-extrabold uppercase">
                {pendingCount} chờ duyệt
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Mọi email đăng nhập bằng Google đều hiện ở đây. Chưa duyệt thì không đọc được số liệu nào.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
        >
          {loading ? "Đang tải…" : "Tải lại"}
        </button>
      </div>

      {loading && users.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : users.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Chưa có ai đăng nhập ngoài bạn. Khi nhân viên đăng nhập Google lần đầu, họ sẽ hiện ở đây.
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {users.map((u) => {
            const isPending = u.role === "pending";
            const picked = override[u.email] || u.requestedRestaurantId || u.restaurantId || "";
            return (
              <div key={u.email} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{u.email}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        isPending
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {ROLE_LABEL[u.role]}
                    </span>
                    {u.restaurantName && <span>Đang xem: {u.restaurantName}</span>}
                    {isPending && u.requestedRestaurantName && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Xin vào: <strong>{u.requestedRestaurantName}</strong>
                      </span>
                    )}
                    <span>Lần cuối: {fmt(u.lastLoginAt)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <select
                    value={picked}
                    onChange={(e) => setOverride((p) => ({ ...p, [u.email]: e.target.value }))}
                    className="text-xs rounded-lg border border-border bg-background px-2 py-1.5"
                  >
                    <option value="">— chọn nhà hàng —</option>
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => act(u.email, "approve", { restaurantId: picked, role: "restaurant" })}
                    disabled={busy === u.email || !picked}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                  >
                    {busy === u.email ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Duyệt
                  </button>

                  <button
                    onClick={() => act(u.email, "approve", { role: "admin" })}
                    disabled={busy === u.email}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                    title="Cấp quyền xem toàn hệ thống"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Cho làm Ban QL
                  </button>

                  <button
                    onClick={() => act(u.email, isPending ? "reject" : "revoke")}
                    disabled={busy === u.email}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-500/40 transition-colors disabled:opacity-50"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    {isPending ? "Từ chối" : "Thu hồi"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

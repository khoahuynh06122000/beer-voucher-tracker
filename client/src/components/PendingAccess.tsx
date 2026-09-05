/**
 * Màn hình cho người đã đăng nhập Google nhưng CHƯA được cấp quyền.
 *
 * Họ tự chọn nhà hàng muốn xin vào; lựa chọn đó hiện lên trang duyệt của Ban
 * Quản Lý. Trước khi được duyệt, tài khoản không đọc được bất kỳ số liệu nào —
 * server chặn ở /api/db chứ không chỉ ẩn trên giao diện.
 */
import { useState } from "react";
import { Beer, Check, Clock, LogOut, Loader2 } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

export function PendingAccess() {
  const { session, restaurants, requestAccess, refreshSession, logout } = useAuthContext();
  const [choice, setChoice] = useState<string>(session?.requestedRestaurantId || "");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const alreadyRequested = Boolean(session?.requestedRestaurantId);

  const submit = async () => {
    if (!choice || saving) return;
    setSaving(true);
    try {
      await requestAccess(choice);
    } finally {
      setSaving(false);
    }
  };

  const recheck = async () => {
    setChecking(true);
    try {
      await refreshSession();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0d0f15] text-white">
      <div className="w-full max-w-lg rounded-3xl border border-amber-500/30 bg-black/50 p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400">
            <Beer className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black">Tài khoản chờ được duyệt</h1>
            <p className="text-xs text-gray-400 mt-0.5">{session?.email}</p>
          </div>
        </div>

        {alreadyRequested ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              Đã gửi yêu cầu, đang chờ Ban Quản Lý duyệt
            </p>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              Bạn đã xin quyền xem số liệu của{" "}
              <strong>
                {restaurants.find((r) => r.id === session?.requestedRestaurantId)?.name ||
                  session?.requestedRestaurantId}
              </strong>
              . Khi được duyệt, bạn đăng nhập lại là vào được ngay.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-300 leading-relaxed">
            Chọn nhà hàng bạn phụ trách để xin quyền xem và nhập số liệu. Ban Quản Lý sẽ
            nhận được yêu cầu này.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[11px] uppercase font-bold text-gray-400">
            {alreadyRequested ? "Chọn lại nếu bạn chọn nhầm" : "Chọn nhà hàng"}
          </p>
          {restaurants.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setChoice(r.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between ${
                choice === r.id
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-white/10 bg-black/40 text-gray-200 hover:border-amber-400/50"
              }`}
            >
              <span className="font-bold text-sm">{r.name}</span>
              {choice === r.id && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={submit}
            disabled={!choice || saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {alreadyRequested ? "Cập nhật nguyện vọng" : "Gửi yêu cầu"}
          </button>
          <button
            onClick={recheck}
            disabled={checking}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 text-gray-200 font-bold text-sm hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Kiểm tra lại
          </button>
        </div>

        <button
          onClick={logout}
          className="w-full inline-flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-white transition-colors pt-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          Đăng xuất / đổi tài khoản khác
        </button>
      </div>
    </div>
  );
}

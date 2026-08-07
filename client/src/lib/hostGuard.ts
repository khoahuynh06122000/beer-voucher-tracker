/**
 * Chặn app khi bị mở từ HOST CŨ (Google AI Studio / Cloud Run / Firebase Hosting).
 *
 * Lý do: bản chạy trên các host đó ghi dữ liệu vào Firestore cũ, KHÔNG về Supabase.
 * Nhà hàng nhập ở đó thì app Vercel không thấy -> tưởng "chưa nhập báo cáo".
 * Đã từng mất data ngày 04-07/08/2026 vì đúng lỗi này.
 *
 * Chặn cứng ngay trước khi React mount, để không ai lỡ nhập nhầm chỗ.
 */

export const OFFICIAL_URL = "https://beer-voucher-tracker.vercel.app";

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)ai\.studio$/i, // beer-voucher.ai.studio
  /(^|\.)aistudio\.google\.com$/i,
  /\.run\.app$/i, // ais-pre-...-run.app
  /\.usercontent\.goog$/i,
  /\.firebaseapp\.com$/i,
  /\.web\.app$/i,
];

export function isBlockedHost(hostname: string = window.location.hostname): boolean {
  return BLOCKED_HOST_PATTERNS.some((re) => re.test(hostname));
}

export function renderBlockedScreen(hostname: string = window.location.hostname): void {
  document.title = "Link cũ đã ngừng hoạt động";
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
                background:#0f172a;color:#e2e8f0;font-family:system-ui,'Segoe UI',sans-serif">
      <div style="max-width:560px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;
                  box-shadow:0 20px 50px rgba(0,0,0,.45)">
        <div style="font-size:44px;line-height:1;margin-bottom:16px">⛔</div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#f87171">Bạn đang dùng LINK CŨ — đã ngừng hoạt động</h1>
        <p style="margin:0 0 16px;line-height:1.65;color:#cbd5e1">
          Số liệu nhập ở link này <b style="color:#fca5a5">KHÔNG được lưu</b> vào hệ thống chính,
          nên báo cáo sẽ bị thiếu và bị tính là <b>chưa nhập</b>.
        </p>
        <p style="margin:0 0 24px;line-height:1.65;color:#cbd5e1">
          Vui lòng nhập liệu tại địa chỉ chính thức dưới đây, và <b>lưu lại vào Bookmark</b> để lần sau không vào nhầm.
        </p>
        <a href="${OFFICIAL_URL}" style="display:block;text-align:center;background:#f59e0b;color:#1c1917;
           font-weight:700;text-decoration:none;padding:14px 20px;border-radius:10px;font-size:16px">
          Mở link chính thức →
        </a>
        <p style="margin:20px 0 0;font-size:12px;color:#64748b;word-break:break-all">
          Host bị chặn: <code>${hostname}</code><br/>
          Cần hỗ trợ: liên hệ bộ phận Cost / Kế toán.
        </p>
      </div>
    </div>`;
}

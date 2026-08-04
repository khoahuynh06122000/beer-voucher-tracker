/**
 * Compress an image File to a high-definition JPEG Data URL string
 * High quality: max 1800px width/height and 0.82 JPEG quality keeps text sharp & clear when zoomed >200%
 */
export function compressImage(
  file: File,
  maxWidth: number = 1800,
  maxHeight: number = 1800,
  quality: number = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(event.target?.result as string);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// Cloudinary (miễn phí, không cần thẻ) — nơi lưu ẢNH bill. Cloud name + unsigned
// preset là giá trị CÔNG KHAI (dùng phía client), an toàn để trong code.
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "zjtjeyqd";
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET || "orq51tcc";

/**
 * Nén ảnh rồi TẢI LÊN CLOUDINARY, trả về URL CDN (thay vì nhét base64 vào Firestore).
 * Nhờ vậy Firestore chỉ lưu URL nhẹ, không đốt quota DB.
 */
export async function uploadBillImage(
  file: File,
  restaurantId: string,
  date: string
): Promise<string> {
  const dataUrl = await compressImage(file);
  const form = new FormData();
  form.append("file", dataUrl);
  form.append("upload_preset", CLOUDINARY_PRESET);

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Cloudinary upload lỗi ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.secure_url) throw new Error("Cloudinary không trả secure_url");
  return data.secure_url as string;
}

/**
 * Trigger download of a base64 image data URL
 */
export function downloadImage(dataUrl: string, fileName: string = "anh-bill-doi-soat.jpg") {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

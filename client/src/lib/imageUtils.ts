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

/**
 * Nén ảnh rồi TẢI LÊN FIREBASE STORAGE, trả về URL tải xuống (thay vì nhét base64
 * vào Firestore). Nhờ vậy Firestore chỉ lưu URL nhẹ, không đốt quota.
 */
export async function uploadBillImage(
  file: File,
  restaurantId: string,
  date: string
): Promise<string> {
  const dataUrl = await compressImage(file);
  const { storage } = await import("./firebase");
  const { ref, uploadString, getDownloadURL } = await import("firebase/storage");
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `bills/${restaurantId}/${date}/${Date.now()}_${rand}.jpg`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, "data_url");
  return await getDownloadURL(storageRef);
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

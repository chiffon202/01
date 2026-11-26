// ============================================================================
// Offline Receipt / Bill Image Store (IndexedDB + Client-side Compression)
// ----------------------------------------------------------------------------
// Stores compressed receipt/slip photos locally on the user's device without
// filling up the 5MB localStorage quota.
// ============================================================================

const DB_NAME = "treasurer_note_images_db";
const DB_VERSION = 1;
const STORE_NAME = "receipts";

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveReceiptImage(
  imageId: string,
  dataUrl: string
): Promise<void> {
  const db = await openImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(dataUrl, imageId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to save image"));
    };
  });
}

export async function getReceiptImage(imageId: string): Promise<string | null> {
  if (!imageId) return null;
  try {
    const db = await openImageDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(imageId);
      req.onsuccess = () => {
        db.close();
        resolve(typeof req.result === "string" ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("Failed to read image"));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteReceiptImage(imageId: string): Promise<void> {
  if (!imageId) return;
  try {
    const db = await openImageDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(imageId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to delete image"));
      };
    });
  } catch {
    // Ignore cleanup errors
  }
}

export function generateImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `img_${crypto.randomUUID()}`;
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Compresses an uploaded or captured image file using an offscreen canvas
 * (max dimension 1400px, JPEG 0.78) so receipt text stays sharp while file size
 * stays small (~80-180 KB) for fast offline browsing on iPad.
 */
export async function compressReceiptImage(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    };
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    reader.readAsDataURL(file);
  });

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1400;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

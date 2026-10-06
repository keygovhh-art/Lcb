const MAX_UPLOAD_BYTES = 1_500_000;
const MAX_DIMENSION = 1600;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open image"));
    };
    img.src = url;
  });
}

async function compressImage(file: File): Promise<{ blob: Blob; fileName: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  if (file.type === "image/gif" && file.size <= MAX_UPLOAD_BYTES) {
    return { blob: file, fileName: file.name || "image.gif" };
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported on this device");

  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.86;
  let blob: Blob | null = null;
  while (quality >= 0.45) {
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
    quality -= 0.08;
  }

  if (!blob) throw new Error("Could not compress image");
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image is still too large after compression");
  }

  const baseName = (file.name || "image").replace(/\.[^.]+$/, "").slice(0, 120);
  return { blob, fileName: `${baseName}.webp` };
}

export async function uploadImageFile(file: File): Promise<string> {
  const { blob, fileName } = await compressImage(file);
  const dataBase64 = await blobToBase64(blob);

  const response = await fetch("/api/media/images", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName,
      mimeType: blob.type || "image/webp",
      dataBase64,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Image upload failed");
  }

  const result = await response.json() as { url: string };
  return result.url;
}

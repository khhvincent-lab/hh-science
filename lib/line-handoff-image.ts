/** Keep the entire solution; never crop a long explanation to fit a thumbnail. */
export async function prepareHandoffImages(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    async function encode(maxWidth: number, maxBytes: number) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("無法準備圖片，請改用下方圖片分享。");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.92, 0.82, 0.72, 0.6]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= maxBytes) return blob;
      }
      throw new Error("這份詳解圖片較大，請改用下方圖片分享，保留完整清晰內容。");
    }
    const image = await encode(1600, 3000000);
    const preview = await encode(320, 500000);
    return { image, preview };
  } finally { URL.revokeObjectURL(url); }
}

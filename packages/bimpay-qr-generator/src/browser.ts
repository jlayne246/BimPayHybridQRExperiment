import QRCode from "qrcode";
import { buildBiMPayPayload } from "./input.js";
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR image."));
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

export async function prepareQrLogo(source: string): Promise<string> {
  const image = await loadImage(source);
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare logo.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  // Find visible artwork, excluding transparent and near-white outer padding.
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      if (data[index + 3] <= 16 || (data[index] >= 245 && data[index + 1] >= 245 && data[index + 2] >= 245)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return canvas.toDataURL("image/png");
  const padding = Math.max(1, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.01));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(canvas.width - 1, right + padding);
  bottom = Math.min(canvas.height - 1, bottom + padding);
  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) throw new Error("Could not crop logo.");
  croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped.toDataURL("image/png");
}

export async function renderPaymentQr(payload: string, width: number, logo = "", margin = 4, errorCorrectionLevel?: "L" | "M" | "Q" | "H"): Promise<string> {
  const qr = await QRCode.toDataURL(payload, { width, margin, errorCorrectionLevel: errorCorrectionLevel ?? (logo ? "H" : "M") });
  if (!logo) return qr;
  const [qrImage, logoImage] = await Promise.all([loadImage(qr), loadImage(logo)]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = width;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create logo QR.");
  context.drawImage(qrImage, 0, 0, width, width);
  const paddingRatio = 0.015;
  const padding = width * paddingRatio;
  const aspectRatio = logoImage.naturalWidth / logoImage.naturalHeight;
  // Spend the same covered-area budget on wider/taller logos, not a fixed square.
  const areaBudget = 0.22 ** 2;
  const heightBudget = (Math.sqrt(paddingRatio ** 2 * (aspectRatio - 1) ** 2 + aspectRatio * areaBudget) - paddingRatio * (aspectRatio + 1)) / aspectRatio;
  const scale = Math.min(width * 0.32 / logoImage.naturalWidth, width * 0.32 / logoImage.naturalHeight, width * heightBudget / logoImage.naturalHeight);
  const logoWidth = logoImage.naturalWidth * scale;
  const logoHeight = logoImage.naturalHeight * scale;
  const backingWidth = logoWidth + padding * 2;
  const backingHeight = logoHeight + padding * 2;
  const cornerRadius = Math.min(backingWidth, backingHeight) * 0.18;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.roundRect((width - backingWidth) / 2, (width - backingHeight) / 2, backingWidth, backingHeight, cornerRadius);
  context.fill();
  context.save();
  context.clip();
  context.drawImage(logoImage, (width - logoWidth) / 2, (width - logoHeight) / 2, logoWidth, logoHeight);
  context.restore();
  return canvas.toDataURL("image/png");
}


export async function generateBiMPayQr(input: import("./index.js").BiMPayInput, options: { width?: number; margin?: number; logo?: string; errorCorrectionLevel?: "L" | "M" | "Q" | "H" } = {}) {
  const payload = buildBiMPayPayload(input);
  const image = await renderPaymentQr(payload, options.width ?? 380, options.logo, options.margin ?? 4, options.errorCorrectionLevel);
  return { payload, image };
}

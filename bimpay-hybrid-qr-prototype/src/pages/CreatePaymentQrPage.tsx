import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import QRCode from "qrcode";
import { ExperimentalWarning } from "../components/ExperimentalWarning";
import { BIMPAY_GUI, BIMPAY_SCHEME } from "../lib/sandboxEmv";
import { MERCHANT_CATEGORY_OPTIONS } from "../data/merchantCategories";
import { readJsonResponse } from "../lib/http";

type AmountMode = "variable" | "fixed";
type QrExportTemplateId = "sendable-card" | "counter-display" | "sticker" | "print-sheet";
type QrExportSourceId = "raw" | "embedded" | "tokenized" | "complete";
type QrExportThemeId = "ocean" | "indigo" | "sunrise" | "mint" | "mono";

interface EmvField {
  tag: string;
  value: string;
}

interface CoreFields {
  payloadFormat: string;
  initiationMethod: string;
  merchantCategoryCode: string;
  currency: string;
  amount: string;
  country: string;
  merchantName: string;
  merchantCity: string;
}

interface MerchantAccountFields {
  gui: string;
  fiAlias: string;
  branchAlias: string;
  accountReference: string;
  participantCode: string;
  scheme: string;
}

interface AdditionalDataFields {
  billNumber: string;
  mobileNumber: string;
  storeLabel: string;
  loyaltyNumber: string;
  referenceLabel: string;
  customerLabel: string;
  terminalLabel: string;
  purpose: string;
}

interface PrivateFields {
  gui: string;
  requestTimestamp: string;
}

interface PaymentLinkRecord {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
}

interface QrExportSource {
  id: QrExportSourceId;
  label: string;
  description: string;
  value: string;
  qr: string;
}

interface QrExportTemplate {
  id: QrExportTemplateId;
  title: string;
  description: string;
  sizeLabel: string;
}

interface QrExportTheme {
  id: QrExportThemeId;
  title: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  ink: string;
  muted: string;
}

const COUNTRY_OPTIONS = [
  { value: "BB", label: "BB — Barbados" },
  { value: "US", label: "US — United States" },
  { value: "CA", label: "CA — Canada" },
  { value: "GB", label: "GB — United Kingdom" },
  { value: "TT", label: "TT — Trinidad and Tobago" },
  { value: "JM", label: "JM — Jamaica" },
  { value: "GY", label: "GY — Guyana" },
  { value: "LC", label: "LC — Saint Lucia" },
  { value: "VC", label: "VC — Saint Vincent and the Grenadines" },
  { value: "AG", label: "AG — Antigua and Barbuda" },
];

const CURRENCY_OPTIONS = [
  { value: "052", label: "052 — BBD / Barbados Dollar" },
  { value: "840", label: "840 — USD / US Dollar" },
  { value: "124", label: "124 — CAD / Canadian Dollar" },
  { value: "826", label: "826 — GBP / Pound Sterling" },
  { value: "978", label: "978 — EUR / Euro" },
  { value: "780", label: "780 — TTD / Trinidad and Tobago Dollar" },
  { value: "388", label: "388 — JMD / Jamaican Dollar" },
  { value: "328", label: "328 — GYD / Guyana Dollar" },
  { value: "951", label: "951 — XCD / East Caribbean Dollar" },
];

const SANDBOX_ACCOUNT_REFERENCE = "000000000000000";

const QR_EXPORT_TEMPLATES: QrExportTemplate[] = [
  {
    id: "sendable-card",
    title: "Sendable QR Card",
    description: "Compact image for chat, email, or a payment request message.",
    sizeLabel: "1080 x 1350 PNG",
  },
  {
    id: "counter-display",
    title: "Shop Counter Display",
    description: "Portrait sign for a counter, till, donation point, or reception desk.",
    sizeLabel: "1240 x 1748 PNG",
  },
  {
    id: "sticker",
    title: "Sticker / Small Sign",
    description: "Square, low-text layout with maximum QR prominence.",
    sizeLabel: "900 x 900 PNG",
  },
  {
    id: "print-sheet",
    title: "A4 Print Sheet",
    description: "Printable sheet with repeated payment QR copies.",
    sizeLabel: "2480 x 3508 PNG",
  },
];

const QR_EXPORT_THEMES: QrExportTheme[] = [
  {
    id: "ocean",
    title: "Ocean",
    primary: "#075985",
    secondary: "#0ea5e9",
    accent: "#22d3ee",
    surface: "#ecfeff",
    ink: "#082f49",
    muted: "#64748b",
  },
  {
    id: "indigo",
    title: "Indigo",
    primary: "#312e81",
    secondary: "#4f46e5",
    accent: "#f97316",
    surface: "#eef2ff",
    ink: "#111827",
    muted: "#64748b",
  },
  {
    id: "sunrise",
    title: "Sunrise",
    primary: "#7c2d12",
    secondary: "#ea580c",
    accent: "#fbbf24",
    surface: "#fff7ed",
    ink: "#1f2937",
    muted: "#78716c",
  },
  {
    id: "mint",
    title: "Mint",
    primary: "#064e3b",
    secondary: "#10b981",
    accent: "#a3e635",
    surface: "#ecfdf5",
    ink: "#052e16",
    muted: "#64748b",
  },
  {
    id: "mono",
    title: "Mono",
    primary: "#111827",
    secondary: "#374151",
    accent: "#94a3b8",
    surface: "#f8fafc",
    ink: "#111827",
    muted: "#64748b",
  },
];

function tlv(tag: string, value: string): string {
  const normalized = value.trim();
  const length = normalized.length.toString().padStart(2, "0");
  return `${tag}${length}${normalized}`;
}

function optionalTlv(tag: string, value: string): string {
  return value.trim() ? tlv(tag, value) : "";
}

function crc16CcittFalse(input: string): string {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildEmvPayload(fields: EmvField[]): string {
  const withoutCrc =
    fields
      .filter((field) => field.value.trim())
      .map((field) => tlv(field.tag, field.value))
      .join("") + "6304";

  return `${withoutCrc}${crc16CcittFalse(withoutCrc)}`;
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

function safeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qr-code"
  );
}

function generateTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const hh = now.getHours().toString().padStart(2, "0");
  const mi = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{2})?$/.test(value.trim());
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR image."));
    image.src = src;
  });
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
    if (lines.length === maxLines - 1) break;
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);

  lines.forEach((line, index) => {
    const isLastLine = index === maxLines - 1 && words.length > line.split(/\s+/).length;
    context.fillText(isLastLine ? `${line.replace(/\s+\S+$/, "")}...` : line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string
): void {
  drawRoundRect(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
}

function strokeRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string,
  lineWidth: number
): void {
  drawRoundRect(context, x, y, width, height, radius);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawBrandMark(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  theme: QrExportTheme,
  dark = false
): void {
  const size = Math.round(132 * scale);
  const top = y - size;
  const radius = Math.round(20 * scale);
  const tileFill = dark ? "#f8fafc" : theme.surface;

  context.save();
  context.shadowColor = "rgba(2, 6, 23, 0.18)";
  context.shadowBlur = 10 * scale;
  context.shadowOffsetY = 3 * scale;
  fillRoundRect(context, x, top, size, size, radius, tileFill);
  context.restore();

  fillRoundRect(
    context,
    x + size * 0.18,
    top + size * 0.18,
    size * 0.64,
    size * 0.64,
    size * 0.14,
    theme.secondary
  );
  fillRoundRect(
    context,
    x + size * 0.18,
    top + size * 0.34,
    size * 0.64,
    size * 0.42,
    size * 0.12,
    "#ffffff"
  );
  context.strokeStyle = theme.accent;
  context.lineWidth = Math.max(2, 5 * scale);
  context.beginPath();
  context.moveTo(x + size * 0.2, top + size * 0.44);
  context.lineTo(x + size * 0.62, top + size * 0.44);
  context.quadraticCurveTo(x + size * 0.79, top + size * 0.44, x + size * 0.79, top + size * 0.58);
  context.lineTo(x + size * 0.79, top + size * 0.64);
  context.stroke();

  fillRoundRect(
    context,
    x + size * 0.56,
    top + size * 0.56,
    size * 0.28,
    size * 0.17,
    size * 0.08,
    theme.ink
  );
  context.fillStyle = theme.accent;
  context.beginPath();
  context.arc(x + size * 0.64, top + size * 0.645, size * 0.032, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = theme.ink;
  const module = size * 0.07;
  const qrX = x + size * 0.27;
  const qrY = top + size * 0.47;
  [
    [0, 0, 1.4, 1.4],
    [2, 0, 0.8, 0.8],
    [0, 2, 0.8, 0.8],
    [1.2, 2, 1.5, 1.5],
  ].forEach(([left, down, wide, tall]) => {
    context.fillRect(qrX + module * left, qrY + module * down, module * wide, module * tall);
  });
}

function drawQrFrame(
  context: CanvasRenderingContext2D,
  qrImage: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  theme: QrExportTheme,
  radius = 34
): void {
  fillRoundRect(context, x - 34, y - 34, size + 68, size + 68, radius, "#ffffff");
  strokeRoundRect(context, x - 34, y - 34, size + 68, size + 68, radius, theme.accent, 6);
  context.drawImage(qrImage, x, y, size, size);
}

function drawWaveFooter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: QrExportTheme,
  offset = 0
): void {
  context.beginPath();
  context.moveTo(0, height - 150 + offset);
  context.bezierCurveTo(width * 0.26, height - 245 + offset, width * 0.52, height - 60 + offset, width, height - 135 + offset);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fillStyle = theme.accent;
  context.fill();

  context.beginPath();
  context.moveTo(0, height - 118 + offset);
  context.bezierCurveTo(width * 0.28, height - 198 + offset, width * 0.58, height - 8 + offset, width, height - 92 + offset);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fillStyle = theme.primary;
  context.globalAlpha = 0.12;
  context.fill();
  context.globalAlpha = 1;
}

function templateDimensions(templateId: QrExportTemplateId): { width: number; height: number } {
  switch (templateId) {
    case "counter-display":
      return { width: 1240, height: 1748 };
    case "sticker":
      return { width: 900, height: 900 };
    case "print-sheet":
      return { width: 2480, height: 3508 };
    case "sendable-card":
    default:
      return { width: 1080, height: 1350 };
  }
}

async function renderQrTemplatePng({
  templateId,
  qr,
  merchantName,
  merchantCity,
  amountMode,
  amount,
  reference,
  sourceLabel,
  theme,
}: {
  templateId: QrExportTemplateId;
  qr: string;
  merchantName: string;
  merchantCity: string;
  amountMode: AmountMode;
  amount: string;
  reference: string;
  sourceLabel: string;
  theme: QrExportTheme;
}): Promise<string> {
  const { width, height } = templateDimensions(templateId);
  const qrImage = await loadImage(qr);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create export canvas.");

  const displayName = merchantName.trim().toUpperCase() || "TEST ONLY";
  const merchantDisplayName = displayName === "TEST ONLY" ? "SANDBOX MERCHANT" : displayName;
  const displayCity = merchantCity.trim().toUpperCase() || "SANDBOX";
  const amountText = amountMode === "variable" ? "Enter amount after scanning" : `Amount BBD ${amount}`;
  const referenceText = reference.trim().toUpperCase() === "TEST ONLY" ? "Sandbox QR" : reference.trim() || "Sandbox QR";

  context.fillStyle = theme.surface;
  context.fillRect(0, 0, width, height);
  context.fillStyle = theme.ink;

  if (templateId === "print-sheet") {
    context.fillStyle = "#ffffff";
    context.fillRect(110, 110, width - 220, height - 220);
    strokeRoundRect(context, 110, 110, width - 220, height - 220, 32, "#cbd5e1", 4);

    fillRoundRect(context, 110, 110, width - 220, 430, 32, theme.primary);
    context.fillRect(110, 340, width - 220, 200);
    drawBrandMark(context, 230, 265, 1.35, theme, true);

    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "900 96px Arial";
    context.fillText("SCAN TO PAY", width / 2, 320);
    context.font = "700 52px Arial";
    context.fillText(merchantDisplayName, width / 2, 425);
    context.font = "500 36px Arial";
    context.fillText(`${displayCity} / ${amountText}`, width / 2, 485);

    const qrSize = 700;
    const positions = [
      [340, 680],
      [1440, 680],
      [340, 1900],
      [1440, 1900],
    ];

    positions.forEach(([x, y], index) => {
      fillRoundRect(context, x - 45, y - 45, qrSize + 90, qrSize + 220, 38, "#ffffff");
      strokeRoundRect(context, x - 45, y - 45, qrSize + 90, qrSize + 220, 38, "#e2e8f0", 3);
      drawQrFrame(context, qrImage, x, y, qrSize, theme, 28);
      context.fillStyle = theme.ink;
      context.font = "800 36px Arial";
      context.fillText(`${merchantDisplayName} ${index + 1}`, x + qrSize / 2, y + qrSize + 72);
      context.font = "500 28px Arial";
      context.fillText(referenceText, x + qrSize / 2, y + qrSize + 125);
    });

    drawWaveFooter(context, width, height, theme, -55);
    fillRoundRect(context, width / 2 - 260, height - 240, 520, 62, 31, theme.accent);
    context.font = "900 32px Arial";
    context.fillStyle = "#ffffff";
    context.fillText("TEST ONLY", width / 2, height - 199);
    return canvas.toDataURL("image/png");
  }

  const isSticker = templateId === "sticker";
  const isCounter = templateId === "counter-display";
  const margin = isSticker ? 58 : isCounter ? 92 : 72;
  const qrSize = isSticker ? 430 : isCounter ? 760 : 600;

  fillRoundRect(context, margin, margin, width - margin * 2, height - margin * 2, isSticker ? 34 : 42, "#ffffff");
  strokeRoundRect(context, margin, margin, width - margin * 2, height - margin * 2, isSticker ? 34 : 42, "#cbd5e1", isSticker ? 4 : 5);

  context.textAlign = "center";
  context.fillStyle = theme.ink;

  if (isSticker) {
    const innerWidth = width - margin * 2;
    fillRoundRect(context, margin, margin, innerWidth, 110, 34, theme.primary);
    context.fillRect(margin, margin + 70, innerWidth, 48);
    drawBrandMark(context, 96, 144, 0.62, theme, true);
    context.fillStyle = "#ffffff";
    context.font = "900 34px Arial";
    context.textAlign = "right";
    context.fillText("PAY HERE", width - 96, 116);

    fillRoundRect(context, margin + 30, 168, innerWidth - 60, 44, 22, theme.accent);
    context.fillStyle = "#ffffff";
    context.font = "900 24px Arial";
    context.textAlign = "center";
    context.fillText("TEST ONLY", width / 2, 198);

    drawQrFrame(context, qrImage, (width - qrSize) / 2, 250, qrSize, theme, 24);
    context.textAlign = "center";
    context.fillStyle = theme.ink;
    context.font = "800 26px Arial";
    drawWrappedText(context, merchantDisplayName, width / 2, 760, width - 160, 32, 2);
    context.font = "600 20px Arial";
    context.fillStyle = theme.muted;
    context.fillText(amountText, width / 2, 810);
    context.fillStyle = theme.primary;
    context.fillRect(margin + 42, height - margin - 12, innerWidth - 84, 8);
    return canvas.toDataURL("image/png");
  }

  if (isCounter) {
    const headerHeight = 176;
    const innerWidth = width - margin * 2;
    fillRoundRect(context, margin, margin, innerWidth, headerHeight, 42, theme.primary);
    context.fillRect(margin, margin + headerHeight - 30, innerWidth, 38);
    drawBrandMark(context, margin + 58, 180, 0.68, theme, true);

    context.textAlign = "right";
    context.fillStyle = "#ffffff";
    context.font = "900 46px Arial";
    context.fillText("ACCEPTED HERE", width - margin - 58, 154);
    context.font = "800 28px Arial";
    context.fillStyle = theme.accent;
    context.fillText("SCAN & PAY", width - margin - 58, 198);

    fillRoundRect(context, margin + 78, 306, innerWidth - 156, 58, 29, theme.accent);
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.font = "900 34px Arial";
    context.fillText("TEST ONLY", width / 2, 345);

    context.fillStyle = theme.ink;
    context.font = "800 42px Arial";
    drawWrappedText(context, merchantDisplayName, width / 2, 438, width - margin * 3, 50, 2);

    context.fillStyle = theme.muted;
    context.font = "600 27px Arial";
    context.fillText(`${displayCity} / ${amountText}`, width / 2, 508);

    const counterQrSize = 720;
    const counterQrY = 610;
    drawQrFrame(context, qrImage, (width - counterQrSize) / 2, counterQrY, counterQrSize, theme, 34);

    context.fillStyle = theme.ink;
    context.font = "800 30px Arial";
    context.fillText(referenceText, width / 2, 1442);
    context.font = "700 22px Arial";
    context.fillStyle = theme.muted;
    context.fillText(sourceLabel, width / 2, 1490);
    fillRoundRect(context, margin + 70, height - margin - 34, innerWidth - 140, 18, 9, theme.accent);
    return canvas.toDataURL("image/png");
  }

  const headerHeight = 240;
  fillRoundRect(context, margin, margin, width - margin * 2, headerHeight, 42, theme.primary);
  context.fillRect(margin, margin + headerHeight - 34, width - margin * 2, 44);
  drawBrandMark(context, margin + 72, 186, 0.78, theme, true);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = "900 56px Arial";
  context.fillText("ACCEPTED HERE", width / 2 + 120, 154);
  context.font = "800 34px Arial";
  context.fillStyle = theme.accent;
  context.fillText("SCAN & PAY", width / 2 + 120, 208);

  fillRoundRect(context, margin + 72, 305, width - margin * 2 - 144, 52, 26, theme.accent);
  context.fillStyle = "#ffffff";
  context.font = "900 30px Arial";
  context.fillText("TEST ONLY", width / 2, 341);

  context.fillStyle = theme.ink;
  context.font = "800 38px Arial";
  drawWrappedText(context, merchantDisplayName, width / 2, 430, width - margin * 3, 48, 2);

  const qrY = 485;
  drawQrFrame(context, qrImage, (width - qrSize) / 2, qrY, qrSize, theme, 34);

  context.fillStyle = theme.ink;
  context.font = "800 31px Arial";
  context.fillText(amountText, width / 2, qrY + qrSize + 92);
  context.font = "500 24px Arial";
  context.fillStyle = theme.muted;
  context.fillText(`${displayCity} / ${referenceText}`, width / 2, qrY + qrSize + 135);
  context.fillStyle = theme.primary;
  context.fillRect(margin + 72, height - margin - 20, width - margin * 2 - 144, 12);

  return canvas.toDataURL("image/png");
}

export default function CreatePaymentQrPage() {
  const [coreFields, setCoreFields] = useState<CoreFields>({
    payloadFormat: "01",
    initiationMethod: "11",
    merchantCategoryCode: "0000",
    currency: "052",
    amount: "3.50",
    country: "BB",
    merchantName: "TEST ONLY",
    merchantCity: "SANDBOX",
  });

  const [merchantAccountFields, setMerchantAccountFields] =
    useState<MerchantAccountFields>({
      gui: BIMPAY_GUI,
      fiAlias: "TESTROC1",
      branchAlias: "TESTROC1",
      accountReference: SANDBOX_ACCOUNT_REFERENCE,
      participantCode: "333331",
      scheme: BIMPAY_SCHEME,
    });

  const [additionalDataFields, setAdditionalDataFields] = useState<AdditionalDataFields>({
    billNumber: "",
    mobileNumber: "",
    storeLabel: "",
    loyaltyNumber: "",
    referenceLabel: "",
    customerLabel: "",
    terminalLabel: "",
    purpose: "TEST ONLY",
  });

  const [privateFields, setPrivateFields] = useState<PrivateFields>({
    gui: BIMPAY_GUI,
    requestTimestamp: "20260516093000",
  });

  const [token, setToken] = useState("");
  const [embeddedPaymentLink, setEmbeddedPaymentLink] = useState("");
  const [tokenizedPaymentLink, setTokenizedPaymentLink] = useState("");
  const [completePaymentLink, setCompletePaymentLink] = useState("");
  const [rawQr, setRawQr] = useState("");
  const [embeddedLinkQr, setEmbeddedLinkQr] = useState("");
  const [tokenizedLinkQr, setTokenizedLinkQr] = useState("");
  const [completeLinkQr, setCompleteLinkQr] = useState("");
  const [message, setMessage] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("variable");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [exportTemplateId, setExportTemplateId] =
    useState<QrExportTemplateId>("sendable-card");
  const [exportSourceId, setExportSourceId] = useState<QrExportSourceId>("embedded");
  const [exportThemeId, setExportThemeId] = useState<QrExportThemeId>("ocean");

  const merchantAccountTemplate = useMemo(() => {
    return [
      optionalTlv("00", merchantAccountFields.gui),
      optionalTlv("01", merchantAccountFields.fiAlias),
      optionalTlv("02", merchantAccountFields.branchAlias),
      optionalTlv("03", merchantAccountFields.accountReference),
      optionalTlv("04", merchantAccountFields.participantCode),
      optionalTlv("10", merchantAccountFields.scheme),
    ].join("");
  }, [merchantAccountFields]);

  const additionalDataTemplate = useMemo(() => {
    return [
      optionalTlv("01", additionalDataFields.billNumber),
      optionalTlv("02", additionalDataFields.mobileNumber),
      optionalTlv("03", additionalDataFields.storeLabel),
      optionalTlv("04", additionalDataFields.loyaltyNumber),
      optionalTlv("05", additionalDataFields.referenceLabel),
      optionalTlv("06", additionalDataFields.customerLabel),
      optionalTlv("07", additionalDataFields.terminalLabel),
      optionalTlv("08", additionalDataFields.purpose),
    ].join("");
  }, [additionalDataFields]);

  const privateTemplate = useMemo(() => {
    return [
      optionalTlv("00", privateFields.gui),
      optionalTlv("01", privateFields.requestTimestamp),
    ].join("");
  }, [privateFields]);

  const amountTagValue = amountMode === "variable" ? "***" : coreFields.amount;

  const emvFields = useMemo<EmvField[]>(() => {
    return [
      { tag: "00", value: coreFields.payloadFormat },
      { tag: "01", value: coreFields.initiationMethod },
      { tag: "26", value: merchantAccountTemplate },
      { tag: "52", value: coreFields.merchantCategoryCode },
      { tag: "53", value: coreFields.currency },
      { tag: "54", value: amountTagValue },
      { tag: "58", value: coreFields.country },
      { tag: "59", value: coreFields.merchantName.slice(0, 25) },
      { tag: "60", value: coreFields.merchantCity.slice(0, 15) },
      { tag: "62", value: additionalDataTemplate },
      { tag: "80", value: privateTemplate },
    ];
  }, [coreFields, merchantAccountTemplate, additionalDataTemplate, privateTemplate, amountTagValue]);

  const emvPayload = useMemo(() => buildEmvPayload(emvFields), [emvFields]);
  const qrExportSources: QrExportSource[] = [
    {
      id: "raw",
      label: "Raw EMV payload",
      description: "Best for compatible sandbox scanners.",
      value: emvPayload,
      qr: rawQr,
    },
    {
      id: "embedded",
      label: "Embedded payment link",
      description: "Best all-round option for sending or printing.",
      value: embeddedPaymentLink,
      qr: embeddedLinkQr,
    },
    {
      id: "tokenized",
      label: "Tokenized payment link",
      description: "Short URL when the token API is available.",
      value: tokenizedPaymentLink,
      qr: tokenizedLinkQr,
    },
    {
      id: "complete",
      label: "Complete payment link",
      description: "Resolver URL with token and embedded EMV fallback.",
      value: completePaymentLink,
      qr: completeLinkQr,
    },
  ];

  function updateCore<K extends keyof CoreFields>(key: K, value: CoreFields[K]): void {
    setCoreFields((current) => ({ ...current, [key]: value }));
  }

  function updateMerchant<K extends keyof MerchantAccountFields>(key: K, value: MerchantAccountFields[K]): void {
    setMerchantAccountFields((current) => ({ ...current, [key]: value }));
  }

  function updateAdditional<K extends keyof AdditionalDataFields>(key: K, value: AdditionalDataFields[K]): void {
    setAdditionalDataFields((current) => ({ ...current, [key]: value }));
  }

  function updatePrivate<K extends keyof PrivateFields>(key: K, value: PrivateFields[K]): void {
    setPrivateFields((current) => ({ ...current, [key]: value }));
  }

  async function generateQrs(): Promise<void> {
    try {
      if (!coreFields.merchantName.trim() || !coreFields.merchantCity.trim() ||
          Object.values(merchantAccountFields).some((value) => !value.trim())) {
        setMessage("Enter a merchant name, city, and all merchant account information fields.");
        return;
      }

      if (emvFields.some((field) => field.value.trim().length > 99)) {
        setMessage("Each TLV field must fit its two-digit length (99 characters maximum). Shorten the account or additional data fields.");
        return;
      }

      if (amountMode === "fixed" && (!isValidAmount(coreFields.amount) || Number(coreFields.amount) <= 0)) {
        setMessage("Fixed amount must be a valid number, for example 3.50 or 25.00.");
        return;
      }

      setMessage("Generating QR codes...");

      const embeddedLink = `${window.location.origin}/pay?emv=${encodeURIComponent(emvPayload)}`;

      let createdToken = "";
      let tokenizedLink = "";
      let completeLink = "";

      try {
        const response = await fetch("/api/payment-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emvPayload }),
        });

        if (response.ok) {
          const record = await readJsonResponse<PaymentLinkRecord>(response);
          createdToken = record.token;
          tokenizedLink = `${window.location.origin}/pay?t=${record.token}`;

          completeLink = `${window.location.origin}/pay?t=${record.token}&emv=${encodeURIComponent(emvPayload)}`;
        } else {
          console.warn("Token API returned non-OK response", await response.text());
        }
      } catch (apiError) {
        console.warn("Token API unavailable; continuing without tokenized link.", apiError);
      }

      const rawQrDataUrl = await QRCode.toDataURL(emvPayload, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 380,
      });

      const embeddedLinkQrDataUrl = await QRCode.toDataURL(embeddedLink, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 380,
      });

      const tokenizedLinkQrDataUrl = tokenizedLink
        ? await QRCode.toDataURL(tokenizedLink, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 380,
          })
        : "";

      const completeLinkQrDataUrl = completeLink
        ? await QRCode.toDataURL(completeLink, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 380,
          })
        : "";

      setToken(createdToken);
      setRawQr(rawQrDataUrl);
      setEmbeddedPaymentLink(embeddedLink);
      setTokenizedPaymentLink(tokenizedLink);
      setEmbeddedLinkQr(embeddedLinkQrDataUrl);
      setTokenizedLinkQr(tokenizedLinkQrDataUrl);
      setCompletePaymentLink(completeLink);
      setCompleteLinkQr(completeLinkQrDataUrl);
      setMessage(
        tokenizedLink
          ? "Raw, embedded-link, tokenized and complete QR codes generated."
          : "Raw and embedded-link QR codes generated. Token API was unavailable."
      );
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Could not generate QR codes.");
    }
  }

  function copyText(value: string): void {
    if (!value) {
      setMessage("Nothing to copy yet.");
      return;
    }

    void navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  function resetToDefaults(): void {
    setCoreFields({
      payloadFormat: "01",
      initiationMethod: "11",
      merchantCategoryCode: "0000",
      currency: "052",
      amount: "3.50",
      country: "BB",
      merchantName: "TEST ONLY",
      merchantCity: "SANDBOX",
    });

    setMerchantAccountFields({
      gui: BIMPAY_GUI,
      fiAlias: "TESTROC1",
      branchAlias: "TESTROC1",
      accountReference: SANDBOX_ACCOUNT_REFERENCE,
      participantCode: "333331",
      scheme: BIMPAY_SCHEME,
    });

    setAdditionalDataFields({
      billNumber: "",
      mobileNumber: "",
      storeLabel: "",
      loyaltyNumber: "",
      referenceLabel: "",
      customerLabel: "",
      terminalLabel: "",
      purpose: "TEST ONLY",
    });

    setPrivateFields({
      gui: BIMPAY_GUI,
      requestTimestamp: generateTimestamp(),
    });

    setAmountMode("variable");
    setAdvancedMode(false);
    setMessage("Defaults restored.");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create Experimental EMVCo QR</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Build EMVCo-style QR payloads with your merchant and routing details.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAdvancedMode((current) => !current)}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20"
            >
              {advancedMode ? "Hide Advanced" : "Show Advanced"}
            </button>

            <button
              type="button"
              onClick={resetToDefaults}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-200"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </header>

      <div className="mt-6">
        <ExperimentalWarning />
      </div>

      <main className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <EditorSection
            title="Payment Behaviour"
            description="This separates EMVCo initiation semantics from independently observed payment-app amount behaviour."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                label="Amount Mode"
                value={amountMode}
                onChange={(value) => setAmountMode(value as AmountMode)}
                options={[
                  { value: "variable", label: "Variable amount — tag 54 = ***" },
                  { value: "fixed", label: "Fixed amount — tag 54 = numeric amount" },
                ]}
                helper='Observed experimental behaviour: 54 = "***" may prompt for an amount.'
              />

              {amountMode === "fixed" && (
                <Field
                  label="54 Amount"
                  value={coreFields.amount}
                  onChange={(value) => updateCore("amount", value)}
                  helper="Use a numeric value such as 3.50 or 25.00."
                />
              )}

              {amountMode === "variable" && (
                <ReadOnlyField
                  label="54 Transaction Amount"
                  value="***"
                  helper="Some observed payment-app flows appear to treat this sentinel as variable amount."
                />
              )}
            </div>
          </EditorSection>

          <EditorSection
            title="Core EMVCo Fields"
            description="Top-level fields in the EMV merchant-presented QR payload."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {advancedMode && (
                <>
                  <Field label="00 Payload Format" value={coreFields.payloadFormat} onChange={(value) => updateCore("payloadFormat", value)} helper="Usually 01" />
                  <SelectField
                    label="01 Initiation Method"
                    value={coreFields.initiationMethod}
                    onChange={(value) => updateCore("initiationMethod", value)}
                    options={[
                      { value: "11", label: "11 — Static EMVCo" },
                      { value: "12", label: "12 — Dynamic EMVCo" },
                    ]}
                    helper="EMVCo semantic field. Observed amount behaviour may be controlled separately by tag 54."
                  />
                </>
              )}

              <SelectField
                label="52 Merchant Category Code"
                value={coreFields.merchantCategoryCode}
                onChange={(value) => updateCore("merchantCategoryCode", value)}
                options={MERCHANT_CATEGORY_OPTIONS}
                helper="Common MCC presets for transport, retail, food, government, and test flows."
              />
              <SelectField
                label="53 Currency"
                value={coreFields.currency}
                onChange={(value) => updateCore("currency", value)}
                options={CURRENCY_OPTIONS}
                helper="ISO 4217 numeric currency code. 052 = BBD."
              />
              <SelectField
                label="58 Country"
                value={coreFields.country}
                onChange={(value) => updateCore("country", value)}
                options={COUNTRY_OPTIONS}
                helper="ISO 3166-1 alpha-2 country code."
              />
              <Field label="59 Merchant Name" value={coreFields.merchantName} onChange={(value) => updateCore("merchantName", value)} helper="Truncated to 25 chars" />
              <Field label="60 Merchant City" value={coreFields.merchantCity} onChange={(value) => updateCore("merchantCity", value)} helper="Truncated to 15 chars" />
            </div>
          </EditorSection>

          <EditorSection
            title="Tag 26 — Merchant Account Information"
            description="Guided abstraction over scheme-specific merchant account/routing data."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {advancedMode && <Field label="26.00 GUI" value={merchantAccountFields.gui} onChange={(value) => updateMerchant("gui", value)} />}

              <Field
                label="26.01 Financial Institution Alias"
                value={merchantAccountFields.fiAlias}
                onChange={(value) => updateMerchant("fiAlias", value)}
              />

              <Field
                label="26.02 Branch / Service Alias"
                value={merchantAccountFields.branchAlias}
                onChange={(value) => updateMerchant("branchAlias", value)}
              />

              <Field
                label="26.03 Account / Merchant Reference"
                value={merchantAccountFields.accountReference}
                onChange={(value) => updateMerchant("accountReference", value)}
              />

              <Field
                label="26.04 Participant Code"
                value={merchantAccountFields.participantCode}
                onChange={(value) => updateMerchant("participantCode", value)}
              />

              {advancedMode && <Field label="26.10 Scheme" value={merchantAccountFields.scheme} onChange={(value) => updateMerchant("scheme", value)} />}
            </div>

            <TemplatePreview title="Tag 26 Template" value={merchantAccountTemplate} />
          </EditorSection>

          <EditorSection
            title="Tag 62 — Additional Data"
            description="Optional nested labels for reference, bill number, terminal, purpose, or related metadata."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="62.08 Purpose / Notes" value={additionalDataFields.purpose} onChange={(value) => updateAdditional("purpose", value)} />
              {advancedMode && (
                <>
                  <Field label="62.01 Bill Number" value={additionalDataFields.billNumber} onChange={(value) => updateAdditional("billNumber", value)} />
                  <Field label="62.02 Mobile Number" value={additionalDataFields.mobileNumber} onChange={(value) => updateAdditional("mobileNumber", value)} />
                  <Field label="62.03 Store Label" value={additionalDataFields.storeLabel} onChange={(value) => updateAdditional("storeLabel", value)} />
                  <Field label="62.04 Loyalty Number" value={additionalDataFields.loyaltyNumber} onChange={(value) => updateAdditional("loyaltyNumber", value)} />
                  <Field label="62.05 Reference Label" value={additionalDataFields.referenceLabel} onChange={(value) => updateAdditional("referenceLabel", value)} />
                  <Field label="62.06 Customer Label" value={additionalDataFields.customerLabel} onChange={(value) => updateAdditional("customerLabel", value)} />
                  <Field label="62.07 Terminal Label" value={additionalDataFields.terminalLabel} onChange={(value) => updateAdditional("terminalLabel", value)} />
                </>
              )}
            </div>

            <TemplatePreview title="Tag 62 Template" value={additionalDataTemplate || "No additional data fields set."} />
          </EditorSection>

          <EditorSection
            title="Tag 80 — Private Template"
            description="Synthetic private template used to explore independently observed metadata structure."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {advancedMode && <Field label="80.00 GUI" value={privateFields.gui} onChange={(value) => updatePrivate("gui", value)} />}
              <Field label="80.01 Request Timestamp / ID" value={privateFields.requestTimestamp} onChange={(value) => updatePrivate("requestTimestamp", value)} />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => updatePrivate("requestTimestamp", generateTimestamp())}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-50"
              >
                Use Current Timestamp
              </button>
            </div>

            <TemplatePreview title="Tag 80 Template" value={privateTemplate} />
          </EditorSection>

          <button
            type="button"
            onClick={generateQrs}
            className="w-full rounded-3xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-slate-800"
          >
            Generate QR Codes
          </button>

          {message && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">
              {message}
            </div>
          )}

          {token && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              Token: <span className="font-mono">{token}</span>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <QrTemplateExporter
            amount={coreFields.amount}
            amountMode={amountMode}
            merchantCity={coreFields.merchantCity}
            merchantName={coreFields.merchantName}
            reference={
              additionalDataFields.referenceLabel ||
              additionalDataFields.storeLabel ||
              additionalDataFields.purpose
            }
            selectedSourceId={exportSourceId}
            selectedTemplateId={exportTemplateId}
            selectedThemeId={exportThemeId}
            sources={qrExportSources}
            onSourceChange={setExportSourceId}
            onTemplateChange={setExportTemplateId}
            onThemeChange={setExportThemeId}
          />

          <OutputBlock
            title="Raw EMV Payload"
            description="Legacy/app-scannable EMVCo-style payload."
            value={emvPayload}
            qr={rawQr}
            onCopy={() => copyText(emvPayload)}
          />

          <OutputBlock
            title="Embedded EMV Payment Link"
            description="Camera-readable URL carrying the full EMV payload as a query parameter."
            value={embeddedPaymentLink}
            qr={embeddedLinkQr}
            onCopy={() => copyText(embeddedPaymentLink)}
          />

          <OutputBlock
            title="Tokenized Payment Link"
            description="Short resolver URL. Requires /api/payment-links to be available."
            value={tokenizedPaymentLink}
            qr={tokenizedLinkQr}
            onCopy={() => copyText(tokenizedPaymentLink)}
          />

          <OutputBlock
            title="Complete Payment Link"
            description="Full payment link with all necessary parameters (token and EMV payload)."
            value={completePaymentLink}
            qr={completeLinkQr}
            onCopy={() => copyText(completePaymentLink)}
          />

          <EditorSection
            title="Field Assembly Preview"
            description="Top-level TLV fields that will be assembled before CRC is calculated."
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Tag</th>
                    <th className="px-4 py-3">Length</th>
                    <th className="px-4 py-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {emvFields
                    .filter((field) => field.value.trim())
                    .map((field) => (
                      <tr key={field.tag}>
                        <td className="px-4 py-3 font-mono font-bold text-slate-950">{field.tag}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{field.value.trim().length}</td>
                        <td className="max-w-[28rem] px-4 py-3 font-mono text-xs text-slate-700 break-all">{field.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </EditorSection>
        </section>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  helper?: string;
  onChange: (value: string) => void;
}

function Field({ label, value, helper, onChange }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

interface ReadOnlyFieldProps {
  label: string;
  value: string;
  helper?: string;
}

function ReadOnlyField({ label, value, helper }: ReadOnlyFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
        value={value}
        readOnly
      />
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  helper?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function SelectField({ label, value, helper, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <select
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

interface EditorSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function EditorSection({ title, description, children }: EditorSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

interface TemplatePreviewProps {
  title: string;
  value: string;
}

function TemplatePreview({ title, value }: TemplatePreviewProps) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-sm font-bold text-slate-950">{title}</div>
      <div className="rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-700 break-all shadow-inner">
        {value}
      </div>
    </div>
  );
}

interface QrTemplateExporterProps {
  amount: string;
  amountMode: AmountMode;
  merchantCity: string;
  merchantName: string;
  reference: string;
  selectedSourceId: QrExportSourceId;
  selectedTemplateId: QrExportTemplateId;
  selectedThemeId: QrExportThemeId;
  sources: QrExportSource[];
  onSourceChange: (value: QrExportSourceId) => void;
  onTemplateChange: (value: QrExportTemplateId) => void;
  onThemeChange: (value: QrExportThemeId) => void;
}

function QrTemplateExporter({
  amount,
  amountMode,
  merchantCity,
  merchantName,
  reference,
  selectedSourceId,
  selectedTemplateId,
  selectedThemeId,
  sources,
  onSourceChange,
  onTemplateChange,
  onThemeChange,
}: QrTemplateExporterProps) {
  const [exportMessage, setExportMessage] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const selectedTemplate =
    QR_EXPORT_TEMPLATES.find((template) => template.id === selectedTemplateId) ??
    QR_EXPORT_TEMPLATES[0];
  const selectedTheme =
    QR_EXPORT_THEMES.find((theme) => theme.id === selectedThemeId) ?? QR_EXPORT_THEMES[0];
  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const generatedSources = sources.filter((source) => source.qr);
  const amountLabel =
    amountMode === "variable" ? "Customer enters amount" : `Fixed amount BBD ${amount}`;
  const activePreviewDataUrl = selectedSource.qr ? previewDataUrl : "";
  const previewPlaceholder = !selectedSource.qr
    ? "Generate the selected QR source to preview this template."
    : previewMessage || "Rendering preview...";

  async function createTemplatePng(source = selectedSource): Promise<string> {
    if (!source.qr) {
      throw new Error("Generate this QR source before exporting a template.");
    }

    return renderQrTemplatePng({
      templateId: selectedTemplate.id,
      qr: source.qr,
      merchantName,
      merchantCity,
      amountMode,
      amount,
      reference,
      sourceLabel: source.label,
      theme: selectedTheme,
    });
  }

  useEffect(() => {
    let cancelled = false;

    if (!selectedSource.qr) {
      return () => {
        cancelled = true;
      };
    }

    void renderQrTemplatePng({
      templateId: selectedTemplate.id,
      qr: selectedSource.qr,
      merchantName,
      merchantCity,
      amountMode,
      amount,
      reference,
      sourceLabel: selectedSource.label,
      theme: selectedTheme,
    })
      .then((dataUrl) => {
        if (cancelled) return;
        setPreviewDataUrl(dataUrl);
        setPreviewMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewDataUrl("");
        setPreviewMessage(error instanceof Error ? error.message : "Could not render preview.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    amount,
    amountMode,
    merchantCity,
    merchantName,
    reference,
    selectedSource.label,
    selectedSource.qr,
    selectedTemplate.id,
    selectedTheme,
  ]);

  async function downloadTemplate(): Promise<void> {
    try {
      const dataUrl = await createTemplatePng();
      downloadDataUrl(
        dataUrl,
        `${safeFileName(`${merchantName}-${selectedTemplate.title}`)}.png`
      );
      setExportMessage("Template PNG downloaded.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not export template.");
    }
  }

  async function shareTemplate(): Promise<void> {
    try {
      const dataUrl = await createTemplatePng();
      const file = await dataUrlToFile(
        dataUrl,
        `${safeFileName(`${merchantName}-${selectedTemplate.title}`)}.png`
      );

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: selectedTemplate.title,
          text: selectedSource.value,
          files: [file],
        });
        setExportMessage("Share dialog opened.");
        return;
      }

      downloadDataUrl(dataUrl, file.name);
      setExportMessage("Sharing is not supported here, so the PNG was downloaded.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not share template.");
    }
  }

  return (
    <EditorSection
      title="Export Templates"
      description="Package the generated QR into layouts for sending to people or placing in shops."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {QR_EXPORT_TEMPLATES.map((template) => (
          <button
            type="button"
            key={template.id}
            onClick={() => onTemplateChange(template.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              selectedTemplate.id === template.id
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            <span className="block text-sm font-black">{template.title}</span>
            <span
              className={`mt-1 block text-xs leading-5 ${
                selectedTemplate.id === template.id ? "text-slate-200" : "text-slate-500"
              }`}
            >
              {template.description}
            </span>
            <span
              className={`mt-3 block text-xs font-bold ${
                selectedTemplate.id === template.id ? "text-cyan-200" : "text-cyan-700"
              }`}
            >
              {template.sizeLabel}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-sm font-semibold text-slate-700">Colour variation</div>
        <div className="grid gap-2 sm:grid-cols-5">
          {QR_EXPORT_THEMES.map((theme) => (
            <button
              type="button"
              key={theme.id}
              onClick={() => onThemeChange(theme.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                selectedTheme.id === theme.id
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              <span className="flex gap-1">
                {[theme.primary, theme.secondary, theme.accent].map((color) => (
                  <span
                    key={color}
                    className="h-5 w-5 rounded-full border border-white/70"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="mt-2 block text-xs font-black">{theme.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">QR source</span>
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
            value={selectedSource.id}
            onChange={(event) => onSourceChange(event.target.value as QrExportSourceId)}
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
                {source.qr ? "" : " (generate first)"}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {selectedSource.description}
          </span>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-4">
            <div
              className="grid h-28 w-28 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-2"
              style={{ boxShadow: `inset 0 -8px 0 ${selectedTheme.accent}` }}
            >
              {selectedSource.qr ? (
                <img src={selectedSource.qr} alt="" className="h-full w-full" />
              ) : (
                <span className="px-2 text-center text-xs font-bold text-slate-400">
                  Generate QR
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {selectedTemplate.title} / {selectedTheme.title}
              </div>
              <div className="mt-2 text-xl font-black text-slate-950 break-words">
                {merchantName || "TEST ONLY"}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                {merchantCity || "SANDBOX"} / {amountLabel}
              </div>
              <div className="mt-3 text-xs leading-5 text-slate-500">
                {generatedSources.length
                  ? `${generatedSources.length} generated QR source${generatedSources.length === 1 ? "" : "s"} available for template export.`
                  : "Generate QR codes to enable template export."}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black text-slate-950">Template preview</div>
            <div className="text-xs font-semibold text-slate-500">
              Matches the exported PNG for the selected layout and colour.
            </div>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
            {selectedTemplate.sizeLabel}
          </div>
        </div>

        <div className="grid min-h-72 place-items-center rounded-2xl border border-slate-200 bg-white p-4">
          {activePreviewDataUrl ? (
            <img
              src={activePreviewDataUrl}
              alt={`${selectedTemplate.title} preview`}
              className="max-h-[34rem] max-w-full rounded-xl object-contain shadow-sm"
            />
          ) : (
            <div className="px-4 text-center text-sm font-bold text-slate-500">
              {previewPlaceholder}
            </div>
          )}
        </div>

        {activePreviewDataUrl && previewMessage && (
          <div className="mt-3 text-center text-xs font-bold text-slate-500">
            {previewMessage}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadTemplate()}
          disabled={!selectedSource.qr}
          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Download Template PNG
        </button>
        <button
          type="button"
          onClick={() => void shareTemplate()}
          disabled={!selectedSource.qr}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          Share Template
        </button>
      </div>

      {exportMessage && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
          {exportMessage}
        </div>
      )}
    </EditorSection>
  );
}

interface OutputBlockProps {
  title: string;
  description: string;
  value: string;
  qr: string;
  onCopy: () => void;
}

function OutputBlock({ title, description, value, qr, onCopy }: OutputBlockProps) {
  const [shareMessage, setShareMessage] = useState("");

  async function shareQr(): Promise<void> {
    try {
      if (!qr) {
        setShareMessage("Generate the QR code before sharing.");
        return;
      }

      const file = await dataUrlToFile(qr, `${safeFileName(title)}.png`);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text: value, files: [file] });
        setShareMessage("Share dialog opened.");
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title,
          text: value,
          url: value.startsWith("http") ? value : undefined,
        });
        setShareMessage("Share dialog opened.");
        return;
      }

      await navigator.clipboard.writeText(value);
      setShareMessage("Sharing is not supported here, so the value was copied.");
    } catch (error) {
      console.error(error);
      await navigator.clipboard.writeText(value);
      setShareMessage("Could not share QR. The value was copied instead.");
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!value}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Copy
          </button>

          <button
            type="button"
            onClick={shareQr}
            disabled={!qr}
            className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Share QR
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-100 p-4 font-mono text-xs leading-5 text-slate-800 break-all">
        {value || "Generate QR codes to populate this output."}
      </div>

      {qr && (
        <div className="mt-5 flex justify-center">
          <img
            src={qr}
            alt={`${title} QR code`}
            className="h-72 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          />
        </div>
      )}

      {shareMessage && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
          {shareMessage}
        </div>
      )}
    </div>
  );
}

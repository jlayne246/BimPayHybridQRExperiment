import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import jsQR from "jsqr";

type ExtractMode = "empty" | "raw-emv" | "payment-link";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface TlvField {
  tag: string;
  name: string;
  length: number;
  value: string;
  raw: string;
  start: number;
  end: number;
  error?: never;
}

interface TlvParseError {
  error: string;
  index: number;
  tag?: string;
  lengthText?: string;
  declaredLength?: number;
}

type ExtendedMediaTrackConstraints = MediaTrackConstraints & {
  focusMode?: ConstrainDOMString;
};

type TlvItem = TlvField | TlvParseError;

interface ExtractedPayload {
  mode: ExtractMode;
  original: string;
  emv: string;
  link: string;
  token: string;
  error: string;
}

interface CrcResult {
  present: boolean;
  valid: boolean;
  expected: string | null;
  actual: string | null;
  message: string;
}

interface PaymentSummary {
  initiationMethod: string;
  merchantName: string;
  city: string;
  country: string;
  amount: string;
  currency: string;
  merchantCategoryCode: string;
  reference: string;
}

const SAMPLE_EMV =
  "00020101021126780014bb.org.cb.mpqr0108TESTROC10208TESTROC103153000002075787870405333331104QRBB52044111530305254043.505802BB5910Sample Bus6010Bridgetown62120808Bus fare80360014bb.org.cb.mpqr01142026051609300063044C51";

const SAMPLE_LINK = `https://pay.bimpay.bb/pay/test?emv=${encodeURIComponent(SAMPLE_EMV)}`;

const TAG_NAMES: Record<string, string> = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  "26": "Merchant Account Information",
  "52": "Merchant Category Code",
  "53": "Transaction Currency",
  "54": "Transaction Amount",
  "58": "Country Code",
  "59": "Merchant Name",
  "60": "Merchant City",
  "62": "Additional Data Field Template",
  "63": "CRC",
  "80": "BiMPay / Private Template",
};

const CURRENCY_CODES: Record<string, string> = {
  "052": "BBD",
  "840": "USD",
  "978": "EUR",
  "826": "GBP",
  "124": "CAD",
};

function isTlvField(item: TlvItem): item is TlvField {
  return "tag" in item && "value" in item && !("error" in item);
}

function parseTlv(payload: string, start = 0, end = payload.length): TlvItem[] {
  const fields: TlvItem[] = [];
  let i = start;

  while (i < end) {
    if (i + 4 > end) {
      fields.push({ error: "Incomplete TLV header", index: i });
      break;
    }

    const tag = payload.slice(i, i + 2);
    const lengthText = payload.slice(i + 2, i + 4);
    const length = Number.parseInt(lengthText, 10);

    if (!/^\d{2}$/.test(tag) || Number.isNaN(length)) {
      fields.push({ error: "Invalid TLV tag or length", index: i, tag, lengthText });
      break;
    }

    const valueStart = i + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > end) {
      fields.push({
        error: "TLV value extends beyond payload length",
        index: i,
        tag,
        declaredLength: length,
      });
      break;
    }

    const value = payload.slice(valueStart, valueEnd);

    fields.push({
      tag,
      name: TAG_NAMES[tag] ?? `Tag ${tag}`,
      length,
      value,
      raw: payload.slice(i, valueEnd),
      start: i,
      end: valueEnd,
    });

    i = valueEnd;
  }

  return fields;
}

function crc16CcittFalse(input: string): string {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function validateEmvCrc(payload: string): CrcResult {
  const crcIndex = payload.lastIndexOf("6304");

  if (crcIndex < 0) {
    return {
      present: false,
      valid: false,
      expected: null,
      actual: null,
      message: "No CRC field found.",
    };
  }

  const actual = payload.slice(crcIndex + 4, crcIndex + 8).toUpperCase();
  const withoutActualCrc = payload.slice(0, crcIndex + 4);
  const expected = crc16CcittFalse(withoutActualCrc);

  return {
    present: true,
    valid: actual === expected,
    expected,
    actual,
    message: actual === expected ? "CRC is valid." : "CRC is invalid.",
  };
}

function extractPayload(input: string): ExtractedPayload {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      mode: "empty",
      original: input,
      emv: "",
      link: "",
      token: "",
      error: "Paste a raw EMV payload or a payment link.",
    };
  }

  try {
    const url = new URL(trimmed);
    const emvParam = url.searchParams.get("emv");
    const tokenParam = url.searchParams.get("t");
    const payloadParam = url.searchParams.get("payload");
    const codeParam = url.searchParams.get("code");
    // const token = url.pathname.split("/").filter(Boolean).at(-1) ?? "";

    return {
      mode: "payment-link",
      original: input,
      link: trimmed,
      emv: emvParam ?? payloadParam ?? codeParam ?? "",
      token: tokenParam ?? "",
      error: emvParam || payloadParam || codeParam || tokenParam ? "" : "No emv, payload, or code query parameter found.",
    };
  } catch {
    return {
      mode: "raw-emv",
      original: input,
      link: "",
      emv: trimmed,
      token: "",
      error: "",
    };
  }
}

function parseNestedField(field: TlvField): TlvItem[] {
  const nestedTags = new Set<string>([
    "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39",
    "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "62",
    "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99",
  ]);

  if (!nestedTags.has(field.tag)) return [];

  return parseTlv(field.value);
}

function summarizePayment(fields: TlvItem[]): PaymentSummary {
  const tlvFields = fields.filter(isTlvField);
  const get = (tag: string): string => tlvFields.find((field) => field.tag === tag)?.value ?? "";

  const additionalData = tlvFields.find((field) => field.tag === "62");
  const additionalFields = additionalData ? parseTlv(additionalData.value).filter(isTlvField) : [];

  return {
    initiationMethod: get("01") === "11" ? "Static" : get("01") === "12" ? "Dynamic" : get("01") || "Unknown",
    merchantName: get("59"),
    city: get("60"),
    country: get("58"),
    amount: get("54"),
    currency: CURRENCY_CODES[get("53")] ?? get("53"),
    merchantCategoryCode: get("52"),
    reference:
      additionalFields.find((field) => field.tag === "08")?.value ??
      additionalFields.find((field) => field.tag === "01")?.value ??
      "",
  };
}

function badgeClasses(tone: BadgeTone): string {
  const base = "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset";

  switch (tone) {
    case "success":
      return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
    case "warning":
      return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
    case "danger":
      return `${base} bg-red-50 text-red-700 ring-red-200`;
    case "info":
      return `${base} bg-blue-50 text-blue-700 ring-blue-200`;
    default:
      return `${base} bg-slate-100 text-slate-700 ring-slate-200`;
  }
}

function modeLabel(mode: ExtractMode): string {
  switch (mode) {
    case "payment-link":
      return "Payment Link";
    case "raw-emv":
      return "Raw EMV";
    default:
      return "No Input";
  }
}

function modeTone(mode: ExtractMode): BadgeTone {
  switch (mode) {
    case "payment-link":
      return "info";
    case "raw-emv":
      return "neutral";
    default:
      return "warning";
  }
}

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
}

function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-bold text-slate-950">{value || "—"}</div>
      {helper && <div className="mt-1 text-xs text-slate-500">{helper}</div>}
    </div>
  );
}

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

interface FieldCardProps {
  field: TlvItem;
}

function FieldCard({ field }: FieldCardProps) {
  if (!isTlvField(field)) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
        <div className="flex items-center justify-between gap-3">
          <div className="font-bold">Parse Error</div>
          <span className={badgeClasses("danger")}>Invalid</span>
        </div>
        <p className="mt-2 text-sm">{field.error}</p>
        <div className="mt-2 rounded-xl bg-white/70 p-3 font-mono text-xs">Index: {field.index}</div>
      </div>
    );
  }

  const nested = parseNestedField(field);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-950 px-2 py-1 font-mono text-xs font-bold text-white">{field.tag}</span>
              <span className="font-semibold text-slate-950">{field.name}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Length {field.length} · Position {field.start}–{field.end}
            </div>
          </div>
          {nested.length > 0 && <span className={badgeClasses("info")}>Nested</span>}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Value</div>
          <div className="max-h-32 overflow-auto rounded-xl bg-slate-100 p-3 font-mono text-xs leading-5 text-slate-800 break-all">
            {field.value}
          </div>
        </div>

        {nested.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Nested TLV</div>
            {nested.map((sub, index) => {
              if (!isTlvField(sub)) {
                return (
                  <div key={`${field.tag}-error-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                    <div className="font-semibold text-sm">Nested Parse Error</div>
                    <div className="text-xs">{sub.error}</div>
                  </div>
                );
              }

              return (
                <div key={`${field.tag}-${sub.tag}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-slate-950">
                      <span className="font-mono text-slate-500">{field.tag}.{sub.tag}</span> — {sub.name}
                    </div>
                    <span className="text-xs text-slate-500">Len {sub.length}</span>
                  </div>
                  <div className="mt-2 rounded-lg bg-slate-100 p-2 font-mono text-xs break-all text-slate-700">{sub.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResolverPage() {
  const [input, setInput] = useState<string>(SAMPLE_LINK);
  const [scanMessage, setScanMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  const extracted = useMemo<ExtractedPayload>(() => extractPayload(input), [input]);
  const fields = useMemo<TlvItem[]>(() => (extracted.emv ? parseTlv(extracted.emv) : []), [extracted.emv]);
  const crc = useMemo<CrcResult | null>(() => (extracted.emv ? validateEmvCrc(extracted.emv) : null), [extracted.emv]);
  const summary = useMemo<PaymentSummary>(() => summarizePayment(fields), [fields]);

  const [searchParams] = useSearchParams();
  // const { token } = useParams();

  const emvQuery = searchParams.get("emv");
  const tokenQuery = searchParams.get("t");

  useEffect(() => {
    async function resolvePaymentIntent(): Promise<void> {
      if (tokenQuery) {
        try {
          setScanMessage(`Resolving payment token: ${tokenQuery}`);

          const response = await fetch(
            `/api/payment-links?t=${encodeURIComponent(tokenQuery)}`
          );

          if (!response.ok) {
            throw new Error("Payment token not found.");
          }

          const record = (await response.json()) as {
            token: string;
            emvPayload: string;
            createdAt: string;
            isActive: boolean;
            expiresAt: string;
          };

          setInput(record.emvPayload);
          setScanMessage("Payment token resolved successfully. Token expires at " + new Date(record.expiresAt).toLocaleTimeString());
          return;
        } catch (error) {
          console.error(error);

          if (emvQuery) {
            setInput(emvQuery);
            setScanMessage(
              "Token could not be resolved. Falling back to embedded EMV payload."
            );
            return;
          }

          setScanMessage("Could not resolve payment token.");
          return;
        }
      }

      if (emvQuery) {
        setInput(emvQuery);
        setScanMessage("Payment payload resolved from embedded EMV query.");
      }
    }

    void resolvePaymentIntent();
  }, [tokenQuery, emvQuery]);

  const deepLink = tokenQuery
  ? `https://pay.bimpay.bb/p?t=${encodeURIComponent(tokenQuery)}${
      extracted.emv ? `&emv=${encodeURIComponent(extracted.emv)}` : ""
    }`
  : extracted.emv
    ? `https://pay.bimpay.bb/p?emv=${encodeURIComponent(extracted.emv)}`
    : "";

  const validFields = fields.filter(isTlvField);
  const parseErrors = fields.length - validFields.length;

  function stopCamera(): void {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);
  }

  function scanVideoFrame(): void {
  const video = videoRef.current;
  const canvas = scanCanvasRef.current;

  if (!video || !canvas || !isCameraOpen) return;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  if (
    video.readyState !== video.HAVE_ENOUGH_DATA ||
    video.videoWidth === 0 ||
    video.videoHeight === 0
  ) {
    animationRef.current = requestAnimationFrame(scanVideoFrame);
    return;
  }

  // Scale up the camera frame to help jsQR read dense/custom QR codes
  const scale = Math.max(1, 1400 / Math.max(video.videoWidth, video.videoHeight));

  canvas.width = Math.floor(video.videoWidth * scale);
  canvas.height = Math.floor(video.videoHeight * scale);

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });

  if (result?.data) {
    setInput(result.data);
    setScanMessage("QR scanned successfully from camera.");
    stopCamera();
    return;
  }

  animationRef.current = requestAnimationFrame(scanVideoFrame);
}

  async function openCameraWithMode(mode: "user" | "environment"): Promise<void> {
    try {
      setScanMessage("Opening camera...");

      const videoConstraints: ExtendedMediaTrackConstraints = {
        facingMode: { ideal: mode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: "continuous",
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraOpen(true);

      const video = videoRef.current;

      if (!video) {
        setScanMessage("Video element was not found.");
        return;
      }

      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        await video.play();

        setScanMessage(
          `Camera open (${mode}). Resolution: ${video.videoWidth}x${video.videoHeight}`
        );

        animationRef.current = requestAnimationFrame(scanVideoFrame);
      };
    } catch (error) {
      console.error(error);

      if (error instanceof DOMException) {
        setScanMessage(`Camera error: ${error.name}. ${error.message}`);
      } else {
        setScanMessage("Could not open the camera.");
      }

      stopCamera();
    }
  }

  function openCamera(): void {
    void openCameraWithMode(facingMode);
  }

  function flipCamera(): void {
    const nextMode = facingMode === "environment" ? "user" : "environment";

    stopCamera();
    setFacingMode(nextMode);

    window.setTimeout(() => {
      void openCameraWithMode(nextMode);
    }, 150);
  }

  async function refocusCamera(): Promise<void> {
      const currentMode = facingMode;
      stopCamera();

      window.setTimeout(() => {
        void openCameraWithMode(currentMode);
      }, 250);
    }

  useEffect(() => {
    if (isCameraOpen) {
      animationRef.current = requestAnimationFrame(scanVideoFrame);
    }

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isCameraOpen]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function handleQrUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanMessage("Reading QR image...");

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return;
      }

      const scale = Math.max(1, 1200 / Math.max(img.width, img.height));

      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);

      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (!result?.data) {
        setScanMessage("No QR code was found in the uploaded image.");
        URL.revokeObjectURL(img.src);
        return;
      }

      setInput(result.data);
      setScanMessage("QR decoded successfully.");
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      setScanMessage("Could not load that image.");
      URL.revokeObjectURL(img.src);
    };

    img.src = URL.createObjectURL(file);
    event.target.value = "";
  }

  async function showUniversalLink(): Promise<void> {
    if (!deepLink) {
      setScanMessage(
        "No hypothetical universal payment link could be constructed."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(deepLink);

      setScanMessage(
        `Hypothetical interoperable payment link copied:\n${deepLink}`
      );
    } catch (error) {
      console.error(error);

      setScanMessage(
        `Could not copy link automatically:\n${deepLink}`
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:p-10">
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">Prototype</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">EMV / RTP</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">Hybrid Resolver</span>
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                BiMPay Hybrid QR Resolver
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                A TypeScript prototype for resolving camera-readable payment links and legacy raw EMV/RTP QR payloads into a common payment preview and FI deeplink flow.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <div className="text-sm font-semibold text-slate-200">Current Resolution</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={badgeClasses(modeTone(extracted.mode))}>{modeLabel(extracted.mode)}</span>
                <span className={badgeClasses(crc?.valid ? "success" : crc?.present ? "danger" : "warning")}>{crc?.message ?? "Awaiting payload"}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3">
                  <div className="text-slate-300">Fields</div>
                  <div className="text-2xl font-bold">{validFields.length}</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <div className="text-slate-300">Errors</div>
                  <div className="text-2xl font-bold">{parseErrors}</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <SectionCard
              title="Input"
              description="Paste a payment link, raw EMV payload, or upload a QR image. For camera compatibility, the QR must start with a URL."
            >
              <div className="space-y-4">
                <textarea
                  className="h-64 w-full resize-y rounded-2xl border border-slate-300 bg-white p-4 font-mono text-xs leading-5 text-slate-900 shadow-inner outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-200"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  spellCheck={false}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
                    onClick={() => setInput(SAMPLE_LINK)}
                    type="button"
                  >
                    Load Link Sample
                  </button>

                  <button
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
                    onClick={() => setInput(SAMPLE_EMV)}
                    type="button"
                  >
                    Load Raw EMV
                  </button>

                  <button
                    className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-200"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Upload QR Image
                  </button>

                  <button
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                    onClick={isCameraOpen ? stopCamera : openCamera}
                    type="button"
                  >
                    {isCameraOpen ? "Stop Camera" : "Open Camera Scanner"}
                  </button>

                  <button
                    className="rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                    onClick={flipCamera}
                    type="button"
                    disabled={!isCameraOpen}
                  >
                    Flip Camera
                  </button>
                  <button
                    className="rounded-2xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500"
                    onClick={refocusCamera}
                    type="button"
                    disabled={!isCameraOpen}
                  >
                    Refocus Camera
                  </button>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />

                <div className={`${isCameraOpen ? "block" : "hidden"} overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-3 shadow-inner`}>
                  <video
                    ref={videoRef}
                    className="aspect-video w-full rounded-2xl object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                  <canvas ref={scanCanvasRef} className="hidden" />
                  <div className="mt-3 text-center text-xs font-medium text-slate-300">
                    Point your camera at a QR code. The scan will stop automatically once a code is detected.
                  </div>
                </div>

                {scanMessage && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-700 break-all">
                    {scanMessage}
                  </div>
                )}

                {extracted.error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                    {extracted.error}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Resolved Payment" description="Normalized preview extracted from the EMV/RTP payload.">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <StatCard label="Merchant" value={summary.merchantName} />
                  <StatCard label="Amount" value={`${summary.amount || "—"} ${summary.currency || ""}`.trim()} />
                  <StatCard label="City" value={summary.city} />
                  <StatCard label="Reference" value={summary.reference} />
                  <StatCard label="Type" value={summary.initiationMethod} />
                  <StatCard label="MCC" value={summary.merchantCategoryCode} helper="Merchant category code" />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-950">CRC Check</div>
                    <span className={badgeClasses(crc?.valid ? "success" : crc?.present ? "danger" : "warning")}>{crc?.valid ? "Valid" : "Attention"}</span>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold">Expected:</span> <span className="font-mono">{crc?.expected ?? "—"}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Actual:</span> <span className="font-mono">{crc?.actual ?? "—"}</span>
                    </div>
                  </div>
                </div>

                <button
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                  onClick={showUniversalLink}
                  type="button"
                >
                  Copy Universal Payment Link
                </button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 text-sm font-bold text-slate-950">Hypothetical Universal Payment Link</div>
                  <div className="rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-700 break-all shadow-inner">
                    {deepLink || "—"}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Hybrid Compatibility Model"
            description="The resolver model keeps raw EMV compatibility while allowing camera-readable URLs and FI app routing."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {[
                ["1", "Camera QR", "Top-level URL is detected by the phone camera."],
                ["2", "Resolver URL", "A web endpoint receives the token or encoded EMV payload."],
                ["3", "Extract EMV", "The resolver normalizes the payment instruction."],
                ["4", "FI Deeplink", "User is routed into a supported payment app."],
                ["5", "RTP Payment", "The app submits through the interoperable payment rail."],
              ].map(([number, title, text]) => (
                <div key={number} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">{number}</div>
                  <div className="font-bold text-slate-950">{title}</div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Decoded EMV Fields"
            description="Top-level TLV fields and nested templates decoded from the current payload."
            action={<span className={badgeClasses(parseErrors > 0 ? "danger" : "success")}>{parseErrors > 0 ? `${parseErrors} parse issue(s)` : "Parse OK"}</span>}
          >
            {fields.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No EMV payload decoded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {fields.map((field, index) => (
                  <FieldCard key={`field-${index}`} field={field} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Implementation Notes">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <div className="mb-2 font-bold text-slate-950">Backward compatibility</div>
                Existing FI apps can keep scanning raw EMV/RTP payloads while newer flows use URL-based resolver links.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <div className="mb-2 font-bold text-slate-950">Production preference</div>
                Prefer short resolver tokens over placing the full EMV payload in the query string for permanent deployment.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <div className="mb-2 font-bold text-slate-950">Security boundary</div>
                The QR should preview payment data only. Final authorization must remain inside the participating FI app.
              </div>
            </div>
          </SectionCard>
        </main>
      </div>
    </div>
  );
}

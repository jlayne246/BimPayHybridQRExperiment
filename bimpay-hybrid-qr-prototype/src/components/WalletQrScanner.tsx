import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import jsQR from "jsqr";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";

interface WalletQrScannerProps {
  onScan: (value: string) => string;
}

interface CameraDiagnostic {
  secureContext: boolean;
  mediaApi: boolean;
  policyAllowed: boolean | null;
  permission: string;
  videoDeviceCount: number | null;
  embedded: boolean;
}

function cameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return "The camera could not be opened. Upload a QR image or paste its contents instead.";
  }

  switch (error.name) {
    case "NotAllowedError":
      return "Camera permission was denied. Allow camera access in the browser, or upload a QR image.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera is exposed to this browser. This is common in desktop sandboxes and remote sessions; upload a QR image instead.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is already in use or unavailable to this browser.";
    case "SecurityError":
      return "Camera access requires HTTPS or localhost. Upload a QR image on this connection.";
    default:
      return `The camera could not be opened (${error.name}). Upload a QR image instead.`;
  }
}

/**
 * Compact wallet scanner with camera, image-upload, and pasted-input fallbacks.
 *
 * Camera access uses media constraints directly so browsers can request
 * permission before device labels or IDs are available.
 */
export function WalletQrScanner({ onScan }: WalletQrScannerProps) {
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [input, setInput] = useState("");
  const [diagnostic, setDiagnostic] = useState<CameraDiagnostic | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  function stopCamera(): void {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  function acceptScan(value: string): void {
    setInput(value);
    setMessage(onScan(value));
    stopCamera();
  }

  async function openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "This browser does not expose a camera API. Upload a QR image or paste its contents."
      );
      return;
    }
    if (!videoRef.current) return;

    stopCamera();
    setMessage("Requesting camera access...");
    setCameraOpen(true);

    try {
      readerRef.current ??= new BrowserMultiFormatReader();
      // Request the stream directly from this click handler so Chrome owns the
      // permission prompt before the decoding library starts its scan loop.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
        },
      });
      controlsRef.current = await readerRef.current.decodeFromStream(
        stream,
        videoRef.current,
        (result) => {
          if (result) acceptScan(result.getText());
        }
      );
      setMessage("Point the camera at a wallet QR code.");
    } catch (error) {
      setMessage(cameraErrorMessage(error));
      stopCamera();
    }
  }

  async function checkCameraAccess(): Promise<void> {
    const mediaApi = Boolean(navigator.mediaDevices?.getUserMedia);
    const policy = (
      document as Document & {
        permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
      }
    ).permissionsPolicy;
    let permission = "unknown";
    let videoDeviceCount: number | null = null;

    try {
      const status = await navigator.permissions?.query({
        name: "camera" as PermissionName,
      });
      permission = status?.state ?? "unknown";
    } catch {
      // Camera permission queries are not implemented in every browser.
    }

    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDeviceCount = devices.filter((device) => device.kind === "videoinput").length;
      } catch {
        videoDeviceCount = null;
      }
    }

    setDiagnostic({
      secureContext: window.isSecureContext,
      mediaApi,
      policyAllowed: policy ? policy.allowsFeature("camera") : null,
      permission,
      videoDeviceCount,
      embedded: window.top !== window.self,
    });
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("Reading QR image...");

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setMessage("The QR image could not be read.");
        URL.revokeObjectURL(image.src);
        return;
      }

      const scale = Math.max(1, 1400 / Math.max(image.width, image.height));
      canvas.width = Math.floor(image.width * scale);
      canvas.height = Math.floor(image.height * scale);
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });
      URL.revokeObjectURL(image.src);

      if (result?.data) {
        acceptScan(result.data);
      } else {
        setMessage("No QR code was found in that image.");
      }
    };
    image.onerror = () => {
      setMessage("The selected image could not be loaded.");
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
    event.target.value = "";
  }

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <div className="mb-6 rounded-2xl border border-cyan-200 bg-cyan-50/60">
      <button
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (open) stopCamera();
          setOpen((current) => !current);
        }}
      >
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
            Wallet QR scanner
          </span>
          <span className="mt-1 block text-sm font-bold text-slate-700">
            Scan, upload, or paste a payment QR
          </span>
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-cyan-800">
          {open ? "Close -" : "Open +"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-cyan-200 px-5 py-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-xl bg-cyan-700 px-4 py-3 text-sm font-black text-white"
              type="button"
              onClick={() => (cameraOpen ? stopCamera() : void openCamera())}
            >
              {cameraOpen ? "Stop camera" : "Open camera"}
            </button>
            <button
              className="rounded-xl bg-white px-4 py-3 text-sm font-black text-cyan-800 ring-1 ring-cyan-200"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload QR image
            </button>
          </div>
          <button
            className="w-full rounded-xl border border-cyan-300 bg-cyan-100/60 px-4 py-3 text-sm font-black text-cyan-900"
            type="button"
            onClick={() => void checkCameraAccess()}
          >
            Check camera access
          </button>

          {diagnostic && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3 text-xs text-slate-700">
              <DiagnosticValue
                label="Secure context"
                value={diagnostic.secureContext ? "Yes" : "No"}
              />
              <DiagnosticValue
                label="Camera API"
                value={diagnostic.mediaApi ? "Available" : "Unavailable"}
              />
              <DiagnosticValue label="Permission" value={diagnostic.permission} />
              <DiagnosticValue
                label="Video devices"
                value={
                  diagnostic.videoDeviceCount === null
                    ? "Unknown"
                    : String(diagnostic.videoDeviceCount)
                }
              />
              <DiagnosticValue
                label="Policy"
                value={
                  diagnostic.policyAllowed === null
                    ? "Not reported"
                    : diagnostic.policyAllowed
                      ? "Allowed"
                      : "Blocked"
                }
              />
              <DiagnosticValue
                label="Browser context"
                value={diagnostic.embedded ? "Embedded" : "Top-level"}
              />
              {diagnostic.embedded && (
                <p className="col-span-2 mt-1 rounded-lg bg-amber-50 p-2 leading-5 text-amber-900">
                  The host application or iframe must also allow camera access. Open the
                  deployed site directly in Safari, Chrome, or Edge to compare.
                </p>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={handleUpload}
          />

          <video
            ref={videoRef}
            className={`aspect-video w-full rounded-2xl bg-slate-950 object-cover ${
              cameraOpen ? "block" : "hidden"
            }`}
            autoPlay
            muted
            playsInline
          />

          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-600">
              Paste QR link or raw EMV payload
            </span>
            <textarea
              className="mt-2 h-24 w-full rounded-xl border border-cyan-200 bg-white p-3 font-mono text-xs outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <button
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            type="button"
            disabled={!input.trim()}
            onClick={() => acceptScan(input.trim())}
          >
            Apply scanned payment
          </button>

          {message && (
            <div className="rounded-xl bg-white p-3 text-sm font-bold leading-6 text-slate-700">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value}</div>
    </div>
  );
}

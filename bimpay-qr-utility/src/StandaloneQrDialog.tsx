import { useEffect, useRef, useState } from "react";
import { renderPaymentQr } from "bimpay-qr-generator";

const OUTPUT_WIDTH = 2048;

export default function StandaloneQrDialog({ payload, logo, merchantName, fixedPrice, onClose }: {
  payload: string;
  logo: string;
  merchantName: string;
  fixedPrice: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setImage("");
    setError("");
    void renderPaymentQr(payload, OUTPUT_WIDTH, logo, 4).then(image => {
      if (!cancelled) setImage(image);
    }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : "Could not generate QR image.");
    });
    return () => { cancelled = true; };
  }, [payload, logo]);

  function download() {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    const name = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "payment";
    link.download = `${name}-qr-${OUTPUT_WIDTH}.png`;
    link.click();
  }

  return (
    <dialog ref={dialog} aria-labelledby="standalone-qr-title" onCancel={event => { event.preventDefault(); onClose(); }}
      className="fixed m-auto max-h-[90dvh] w-[min(94vw,640px)] overflow-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-xl backdrop:bg-slate-950/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="standalone-qr-title" className="text-xl font-bold">High-resolution payment QR</h2>
          <p className="mt-1 text-sm text-slate-600">{merchantName}{fixedPrice ? ` — ${fixedPrice}` : ""}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Close</button>
      </div>
      <div className="mt-4 flex min-h-40 justify-center" aria-busy={!image && !error}>
        {image ? <img src={image} alt="High-resolution payment QR" width={OUTPUT_WIDTH} height={OUTPUT_WIDTH} className="h-auto w-full max-w-[min(60vh,512px)] object-contain" />
          : <p role="status" className="self-center text-sm text-slate-600">{error || "Preparing high-resolution QR…"}</p>}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">{OUTPUT_WIDTH} × {OUTPUT_WIDTH} pixels · PNG · QR only</p>
      <button type="button" disabled={!image} onClick={download} className="mt-4 w-full rounded-lg bg-cyan-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Download QR PNG</button>
    </dialog>
  );
}

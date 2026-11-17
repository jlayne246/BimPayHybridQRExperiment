import { useEffect, useRef, useState } from "react";
import { renderPaymentQr } from "bimpay-qr-generator";

const WIDTH = 2048;

export default function StandaloneQrOutput({ payload, logo, merchantName, onOpen }: {
  payload: string; logo: string; merchantName: string; onOpen: () => void;
}) {
  const key = JSON.stringify([payload, logo]);
  const latestKey = useRef(key);
  latestKey.current = key;
  const mounted = useRef(true);
  const [output, setOutput] = useState({ key: "", image: "" });
  const [message, setMessage] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const image = payload && output.key === key ? output.image : "";
  const filename = `${merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "payment"}-qr-${WIDTH}`;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setMessage("");
    if (payload) void renderPaymentQr(payload, WIDTH, logo, 4).then(image => {
      if (!cancelled) setOutput({ key, image });
    }).catch(error => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not generate QR image.");
    });
    return () => { cancelled = true; };
  }, [payload, logo, key]);

  function assertCurrent() {
    if (!mounted.current || !image || latestKey.current !== key) throw new Error("Payment details changed. Generate the QR again before exporting.");
  }
  function download(url: string, extension: string) {
    assertCurrent();
    const link = document.createElement("a");
    link.href = url; link.download = `${filename}.${extension}`; link.click();
  }
  function downloadPng() {
    try { download(image, "png"); setMessage("QR PNG downloaded."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not download QR."); }
  }
  async function downloadPdf() {
    setExportingPdf(true);
    try {
      assertCurrent();
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const size = 100 * 72 / 25.4;
      const page = pdf.addPage([size, size]);
      const artwork = await pdf.embedPng(image);
      page.drawImage(artwork, { x: 0, y: 0, width: size, height: size });
      pdf.setTitle(`${merchantName || "Payment"} QR`);
      pdf.setCreator("BiMPay QR Utility");
      const bytes = await pdf.save();
      assertCurrent();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      try { download(url, "pdf"); }
      finally { window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      setMessage("QR PDF downloaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export QR PDF."); }
    finally { setExportingPdf(false); }
  }
  async function share() {
    try {
      assertCurrent();
      const response = await fetch(image);
      const file = new File([await response.blob()], `${filename}.png`, { type: "image/png" });
      assertCurrent();
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${merchantName || "Payment"} QR`, files: [file] });
        setMessage("Share dialog opened.");
      } else {
        download(image, "png");
        setMessage("Sharing is not supported here, so the QR PNG was downloaded.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not share QR."); }
  }
  const buttonClass = "rounded-lg border border-cyan-950 bg-white px-4 py-3 text-sm font-bold text-cyan-950 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <section aria-label="Standalone QR output" className="mt-5 rounded-lg border border-slate-200 bg-slate-100 p-4">
      <h4 className="text-sm font-black text-slate-950">Printable QR preview</h4>
      <p className="text-xs font-semibold text-slate-500">QR only · 2048 × 2048 PNG · 100 × 100 mm PDF</p>
      <div className="mt-3 grid min-h-40 place-items-center rounded-lg border border-slate-200 bg-white p-4">
        <button type="button" aria-label="Open high-resolution QR" title="Open larger QR" disabled={!image} onClick={onOpen} className="max-w-full disabled:cursor-not-allowed">
          {image ? <img src={image} width={WIDTH} height={WIDTH} alt="Standalone payment QR" className="max-h-80 max-w-full object-contain" />
            : <span className="text-sm font-bold text-slate-500">{payload ? "Preparing high-resolution QR…" : "Generate a payment QR to preview it here."}</span>}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Select the QR to open a larger view.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" aria-label="Download QR as PNG" disabled={!image} onClick={downloadPng} className="rounded-lg bg-cyan-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Download as PNG</button>
        <button type="button" aria-label="Download QR as PDF" disabled={!image || exportingPdf} onClick={downloadPdf} className={buttonClass}>{exportingPdf ? "Preparing PDF…" : "Download as PDF"}</button>
        <button type="button" aria-label="Share QR image" disabled={!image} onClick={share} className={buttonClass}>Share QR</button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    </section>
  );
}

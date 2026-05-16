import { useMemo, useState } from "react";
import QRCode from "qrcode";

interface EmvField {
  tag: string;
  value: string;
}

function tlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${tag}${length}${value}`;
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

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], filename, {
    type: blob.type || "image/png",
  });
}

function safeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qr-code"
  );
}

function buildEmvPayload(fields: EmvField[]): string {
  const withoutCrc = fields.map((field) => tlv(field.tag, field.value)).join("") + "6304";
  const crc = crc16CcittFalse(withoutCrc);

  return `${withoutCrc}${crc}`;
}

function buildMerchantAccountTemplate(): string {
  return [
    tlv("00", "bb.org.cb.mpqr"),
    tlv("01", "TESTROC1"),
    tlv("02", "TESTROC1"),
    tlv("03", "300000207578787"),
    tlv("04", "333331"),
    tlv("10", "QRBB"),
  ].join("");
}

function buildPrivateTemplate(): string {
  return [tlv("00", "bb.org.cb.mpqr"), tlv("01", "20260516093000")].join("");
}

export default function CreatePaymentQrPage() {
  const [merchantName, setMerchantName] = useState("Sample Bus");
  const [city, setCity] = useState("Bridgetown");
  const [amount, setAmount] = useState("3.50");
  const [reference, setReference] = useState("Bus fare");
  const [merchantCategoryCode, setMerchantCategoryCode] = useState("4111");

  const [token, setToken] = useState("");

  const [embeddedPaymentLink, setEmbeddedPaymentLink] = useState("");
  const [tokenizedPaymentLink, setTokenizedPaymentLink] = useState("");

  const [rawQr, setRawQr] = useState("");
  const [embeddedLinkQr, setEmbeddedLinkQr] = useState("");
  const [tokenizedLinkQr, setTokenizedLinkQr] = useState("");

  const [message, setMessage] = useState("");

  const emvPayload = useMemo(() => {
    const fields: EmvField[] = [
      { tag: "00", value: "01" },
      { tag: "01", value: "11" },
      { tag: "26", value: buildMerchantAccountTemplate() },
      { tag: "52", value: merchantCategoryCode },
      { tag: "53", value: "052" },
      { tag: "54", value: amount },
      { tag: "58", value: "BB" },
      { tag: "59", value: merchantName.slice(0, 25) },
      { tag: "60", value: city.slice(0, 15) },
      { tag: "62", value: tlv("08", reference.slice(0, 25)) },
      { tag: "80", value: buildPrivateTemplate() },
    ];

    return buildEmvPayload(fields);
  }, [merchantName, city, amount, reference, merchantCategoryCode]);

  // const paymentLink = useMemo(() => {
  //   const appHost = window.location.origin;
  //   return `${appHost}/pay?emv=${encodeURIComponent(emvPayload)}`;
  // }, [emvPayload]);

  

  async function generateQrs(): Promise<void> {
    try {
      setMessage("Generating QR codes...");

      const response = await fetch("/api/payment-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emvPayload,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Could not create payment link token.");
      }

      const record = (await response.json()) as {
        token: string;
        emvPayload: string;
        createdAt: string;
        isActive: boolean;
      };

      const embeddedLink = `${window.location.origin}/pay?emv=${encodeURIComponent(
        emvPayload
      )}`;

      const tokenizedLink = `${window.location.origin}/pay/${record.token}`;

      const rawQrDataUrl = await QRCode.toDataURL(emvPayload, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      });

      const embeddedLinkQrDataUrl = await QRCode.toDataURL(embeddedLink, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      });

      const tokenizedLinkQrDataUrl = await QRCode.toDataURL(tokenizedLink, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      });

      setToken(record.token);
      setRawQr(rawQrDataUrl);
      setEmbeddedPaymentLink(embeddedLink);
      setTokenizedPaymentLink(tokenizedLink);
      setEmbeddedLinkQr(embeddedLinkQrDataUrl);
      setTokenizedLinkQr(tokenizedLinkQrDataUrl);
      setMessage("Tokenized payment link and QR codes generated.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not generate tokenized payment link."
      );
    }
  }

  function copyText(value: string): void {
    void navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          Create BiMPay QR
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Build a prototype EMV/RTP payload, generate a raw EMV QR, and generate a
          camera-readable payment-link QR using the current app host.
        </p>
      </header>

      <main className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Payment Details</h2>

          <div className="mt-5 space-y-4">
            <Field label="Merchant Name" value={merchantName} onChange={setMerchantName} />
            <Field label="City" value={city} onChange={setCity} />
            <Field label="Amount" value={amount} onChange={setAmount} />
            <Field label="Reference" value={reference} onChange={setReference} />
            <Field
              label="Merchant Category Code"
              value={merchantCategoryCode}
              onChange={setMerchantCategoryCode}
            />

            <button
              type="button"
              onClick={generateQrs}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Generate QR Codes
            </button>

            {message && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                {message}
              </div>
            )}

            {token && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                Token: <span className="font-mono">{token}</span>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <OutputBlock
            title="Raw EMV QR"
            description="Legacy/app-scannable EMV payload."
            value={emvPayload}
            qr={rawQr}
            onCopy={() => copyText(emvPayload)}
          />

          <OutputBlock
            title="Embedded EMV Payment Link"
            description="Camera-readable link carrying the full EMV payload."
            value={embeddedPaymentLink}
            qr={embeddedLinkQr}
            onCopy={() => copyText(embeddedPaymentLink)}
          />

          <OutputBlock
            title="Tokenized Payment Link"
            description="Short production-style resolver link."
            value={tokenizedPaymentLink}
            qr={tokenizedLinkQr}
            onCopy={() => copyText(tokenizedPaymentLink)}
          />
        </section>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function Field({ label, value, onChange }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <input
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
        await navigator.share({
          title,
          text: value,
          files: [file],
        });

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
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-50"
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
        {value}
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
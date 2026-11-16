import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import QRCode from "qrcode";
const BIMPAY_GUI = "bb.org.cb.mpqr";
const BIMPAY_SCHEME = "QRBB";
import { MERCHANT_CATEGORY_OPTIONS } from "./data/merchantCategories";
import { TRANSIT_DIRECTORY } from "./data/branchTransitCodes";

const SORTED_MERCHANT_CATEGORY_OPTIONS = [...MERCHANT_CATEGORY_OPTIONS].sort((a, b) => {
  if (a.value === "0000") return -1;
  if (b.value === "0000") return 1;
  return a.label.replace(/^\d{4}\s*-\s*/, "").localeCompare(b.label.replace(/^\d{4}\s*-\s*/, ""), "en");
});

type AmountMode = "variable" | "fixed";
type RecipientType = "large-business" | "small-medium-business" | "microbusiness" | "organisation";
const RECIPIENT_TYPES = [
  { value: "small-medium-business", label: "Small / medium business" },
  { value: "large-business", label: "Large business" },
  { value: "organisation", label: "Charity / non-profit / social organisation" },
  { value: "microbusiness", label: "Individual / microbusiness" },
];
type QrExportTemplateId = "bimpay-accepted" | "bimpay-donations" | "bimpay-fixed" | "bimpay-landscape" | "bimpay-landscape-donations" | "bimpay-landscape-fixed" | "bimpay-merchant" | "bimpay-landscape-merchant";
type QrExportSourceId = "raw";
type QrOutputSize = "original" | "a5" | "a4";
const QR_OUTPUT_SIZES = {
  original: { label: "Original - 1134 x 1701 px", width: 1134, height: 1701 },
  a5: { label: "A5 print - 1748 x 2480 px", width: 1748, height: 2480 },
  a4: { label: "A4 print - 2480 x 3508 px", width: 2480, height: 3508 },
};

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

const EMPTY_ACCOUNT_REFERENCE = "";

const QR_EXPORT_TEMPLATES: QrExportTemplate[] = [
  { id: "bimpay-merchant", title: "BiMPay Merchant Name", description: "Accepted QR payments sign with the merchant name.", sizeLabel: "1134 x 1701 PNG" },
  { id: "bimpay-landscape-merchant", title: "BiMPay Landscape Merchant Name", description: "Landscape accepted QR payments sign with the merchant name.", sizeLabel: "1701 x 1134 PNG" },
  { id: "bimpay-landscape-donations", title: "BiMPay Landscape Donations", description: "Landscape donation sign with a custom cause.", sizeLabel: "1701 x 1134 PNG" },
  { id: "bimpay-landscape-fixed", title: "BiMPay Landscape Fixed Price", description: "Landscape sign with a description and price.", sizeLabel: "1701 x 1134 PNG" },
  { id: "bimpay-landscape", title: "BiMPay Landscape", description: "Accepted-here counter sign in landscape format.", sizeLabel: "1701 x 1134 PNG" },
  { id: "bimpay-fixed", title: "BiMPay Fixed Price", description: "Original fixed-price artwork with an item description.", sizeLabel: "1134 x 1701 PNG" },
  { id: "bimpay-accepted", title: "BiMPay Accepted Here", description: "Original accepted-here artwork.", sizeLabel: "1134 x 1701 PNG" },
  { id: "bimpay-donations", title: "BiMPay Donations", description: "Original donation artwork with a custom cause.", sizeLabel: "1134 x 1701 PNG" },

];

const TEMPLATE_LAYOUTS = [
  { label: "Accepted Here", portrait: "bimpay-accepted", landscape: "bimpay-landscape" },
  { label: "Merchant Name", portrait: "bimpay-merchant", landscape: "bimpay-landscape-merchant" },
  { label: "Donations", portrait: "bimpay-donations", landscape: "bimpay-landscape-donations" },
  { label: "Fixed Price", portrait: "bimpay-fixed", landscape: "bimpay-landscape-fixed" },
] as const;

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

function templateDimensions(templateId: QrExportTemplateId) {
  return templateId.startsWith("bimpay-landscape") ? { width: 1701, height: 1134 } : { width: 1134, height: 1701 };
}

function outputDimensions(templateId: QrExportTemplateId, size: QrOutputSize) {
  const output = QR_OUTPUT_SIZES[size];
  if (!templateId.startsWith("bimpay-landscape")) return output;
  return {
    width: output.height,
    height: output.width,
    label: `${size === "original" ? "Original landscape" : `${size.toUpperCase()} landscape print`} - ${output.height} x ${output.width} px`,
  };
}

async function renderQrTemplatePng({
  templateId,
  qr,
  merchantName,
  donationCause = "",
  fixedDescription = "",
  fixedPrice = "",
  outputSize = "original",
  qrPayload = "",
}: {
  templateId: QrExportTemplateId;
  qr: string;
  merchantName: string;
  merchantCity: string;
  amountMode: AmountMode;
  amount: string;
  reference: string;
  sourceLabel: string;
  donationCause?: string;
  fixedDescription?: string;
  fixedPrice?: string;
  outputSize?: QrOutputSize;
  qrPayload?: string;
}): Promise<string> {
  const { width, height } = templateDimensions(templateId);
  const output = outputDimensions(templateId, outputSize);
  const landscape = templateId.startsWith("bimpay-landscape");
  const fixedTemplate = templateId.endsWith("fixed");
  const donationTemplate = templateId.endsWith("donations");
  const merchantTemplate = templateId.endsWith("merchant");
  const exportFont = landscape ? "Arial" : '"Montserrat Variable"';
  if (merchantTemplate || (!landscape && (fixedTemplate || donationTemplate))) {
    await document.fonts.load(`700 80px "Montserrat Variable"`);
  }
  const textCenter = landscape ? 453 : width / 2;
  const textWidth = landscape ? 700 : 780;
  const qrSize = landscape ? 580 : 720;
  const exportScale = Math.min(output.width / width, output.height / height);
  const qrImage = await loadImage(qrPayload ? await QRCode.toDataURL(qrPayload, {
    width: Math.ceil(qrSize * exportScale), margin: 4, errorCorrectionLevel: "M",
  }) : qr);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create export canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate((canvas.width - width * exportScale) / 2, (canvas.height - height * exportScale) / 2);
  context.scale(exportScale, exportScale);

  if (templateId.startsWith("bimpay-")) {
    if (fixedTemplate && !fixedPrice) {
      throw new Error("Generate a fixed-amount QR to preview or export this template.");
    }
    if (fixedTemplate && fixedDescription.length > 30) {
      throw new Error("Description must be 30 characters or fewer, including spaces.");
    }
    const artwork = await loadImage(`${import.meta.env.BASE_URL}templates/${templateId}.svg`);
    context.drawImage(artwork, 0, 0, width, height);
    // The artwork uses points; this export renders at four pixels per point.
    context.imageSmoothingEnabled = false;
    if (landscape) {
      context.drawImage(qrImage, 959, 148, qrSize, qrSize);
    } else {
      context.fillStyle = "#ffffff";
      context.fillRect(113, 510, 908, 778);
      context.drawImage(qrImage, 207, 539, qrSize, qrSize);
    }
    if (merchantTemplate) {
      context.save();
      // Blank the artwork's fixed heading so the full text block can be centred.
      context.fillStyle = "#dff2f9";
      if (landscape) context.fillRect(100, 150, 780, 590);
      else context.fillRect(114, 160, 906, 340);
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const name = merchantName.trim().toUpperCase();
      const maxWidth = landscape ? 700 : 780;
      const centerX = landscape ? 497 : width / 2;
      context.font = '700 80px "Montserrat Variable"';
      let lines = [name];
      if (context.measureText(name).width > maxWidth) {
        const spaces = Array.from(name.matchAll(/\s+/g), (match) => match.index);
        const breaks = spaces.length ? spaces : Array.from({ length: name.length - 1 }, (_, index) => index + 1);
        const widest = (index: number) => Math.max(context.measureText(name.slice(0, index).trim()).width, context.measureText(name.slice(index).trim()).width);
        const split = breaks.reduce((best, index) => widest(index) < widest(best) ? index : best, breaks[0]);
        lines = [name.slice(0, split).trim(), name.slice(split).trim()];
      }
      const widestLine = Math.max(maxWidth, ...lines.map((line) => context.measureText(line).width));
      context.font = `700 ${80 * maxWidth / widestLine}px "Montserrat Variable"`;
      const subtitleLines = landscape ? ["ACCEPTS QR", "PAYMENTS"] : ["ACCEPTS QR PAYMENTS"];
      const subtitleSize = landscape ? 56 : 52;
      const nameHeight = lines.length * 96 - 16;
      const subtitleHeight = subtitleLines.length * (subtitleSize + 12) - 12;
      const gap = 32;
      const top = (landscape ? 438 : 312) - (nameHeight + gap + subtitleHeight) / 2;
      lines.forEach((line, index) => context.fillText(line, centerX, top + 40 + index * 96));
      context.font = `700 ${subtitleSize}px "Montserrat Variable"`;
      subtitleLines.forEach((line, index) => context.fillText(line, centerX, top + nameHeight + gap + subtitleSize / 2 + index * (subtitleSize + 12)));
      context.restore();
    }
    if (fixedTemplate) {
      context.save();
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `700 56px ${exportFont}`;
      const description = fixedDescription.trim().toUpperCase();
      let lines = description ? [description] : [];
      if (context.measureText(description).width > textWidth) {
        const breaks = Array.from(description.matchAll(/\s+/g), (match) => match.index);
        const candidates = breaks.length ? breaks : Array.from({ length: description.length - 1 }, (_, index) => index + 1);
        const split = candidates.reduce((best, index) => {
          const widest = (position: number) => Math.max(
            context.measureText(description.slice(0, position).trim()).width,
            context.measureText(description.slice(position).trim()).width
          );
          return widest(index) < widest(best) ? index : best;
        }, candidates[0]);
        lines = [description.slice(0, split).trim(), description.slice(split).trim()];
      }
      const widestLine = Math.max(textWidth, ...lines.map((line) => context.measureText(line).width));
      context.font = `700 ${56 * textWidth / widestLine}px ${exportFont}`;
      // Centre the entire description/price block within the artwork's header.
      const descriptionHeight = lines.length ? lines.length * 68 - 12 : 0;
      const gap = lines.length ? 40 : 0;
      const top = (landscape ? 438 : 312) - (descriptionHeight + gap + 80) / 2;
      lines.forEach((line, index) => context.fillText(line, textCenter, top + 28 + index * 68));
      context.font = `700 80px ${exportFont}`;
      context.fillText(fixedPrice, textCenter, top + descriptionHeight + gap + 40, textWidth);
      context.restore();
    }
    if (donationTemplate) {
      const cause = donationCause.trim().slice(0, 30).toUpperCase();
      context.fillStyle = "#0114a8";
      context.textAlign = "center";
      context.font = `700 80px ${exportFont}`;
      const words = cause.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > textWidth) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      const visibleLines = lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
      visibleLines.forEach((text, index) => {
        const fontSize = Math.min(80, 80 * textWidth / Math.max(textWidth, context.measureText(text).width));
        context.save();
        context.font = `700 ${fontSize}px ${exportFont}`;
        context.fillText(text, textCenter, (landscape ? 126 : 0) + (visibleLines.length === 1 ? 386 : 344 + index * 96));
        context.restore();
      });
    }
    return canvas.toDataURL("image/png");
  }

  throw new Error("Unknown export template.");
}

export default function Generator() {
  const [recipientType, setRecipientType] = useState<RecipientType>("small-medium-business");
  const microBusiness = recipientType === "microbusiness";
  const organisation = recipientType === "organisation";
  const largeBusiness = recipientType === "large-business";
  const [technicalMode, setTechnicalMode] = useState(() => window.location.hash === "#/customise");
  useEffect(() => {
    const onRouteChange = () => setTechnicalMode(window.location.hash === "#/customise");
    window.addEventListener("hashchange", onRouteChange);
    return () => window.removeEventListener("hashchange", onRouteChange);
  }, []);
  const [coreFields, setCoreFields] = useState<CoreFields>({
    payloadFormat: "01",
    initiationMethod: "11",
    merchantCategoryCode: "0000",
    currency: "052",
    amount: "3.50",
    country: "BB",
    merchantName: "",
    merchantCity: "BRIDGETOWN",
  });

  const [merchantAccountFields, setMerchantAccountFields] =
    useState<MerchantAccountFields>({
      gui: BIMPAY_GUI,
      fiAlias: "",
      branchAlias: "",
      accountReference: EMPTY_ACCOUNT_REFERENCE,
      participantCode: "",
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
    purpose: "",
  });

  const [privateFields, setPrivateFields] = useState<PrivateFields>({
    gui: BIMPAY_GUI,
    requestTimestamp: generateTimestamp(),
  });

  const [rawQr, setRawQr] = useState("");
  const [generatedPayload, setGeneratedPayload] = useState("");
  const [generatedFixedPrice, setGeneratedFixedPrice] = useState("");
  const [message, setMessage] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("variable");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [institutionBic, setInstitutionBic] = useState("");
  const [branchIndex, setBranchIndex] = useState("");
  const selectedInstitution = TRANSIT_DIRECTORY.find((institution) => institution.bic === institutionBic);
  const selectedBranch = selectedInstitution?.branches[Number(branchIndex)];
  const [exportTemplateId, setExportTemplateId] =
    useState<QrExportTemplateId>("bimpay-accepted");
  const exportSourceId: QrExportSourceId = "raw";

  const merchantAccountTemplate = useMemo(() => {
    return [
      optionalTlv("00", merchantAccountFields.gui),
      optionalTlv("01", merchantAccountFields.fiAlias),
      optionalTlv("02", merchantAccountFields.branchAlias),
      optionalTlv("03", merchantAccountFields.accountReference),
      optionalTlv("04", merchantAccountFields.participantCode),
      optionalTlv("11", merchantAccountFields.scheme),
    ].join("");
  }, [merchantAccountFields]);

  const additionalDataTemplate = useMemo(() => {
    const fullDetails = technicalMode || recipientType === "large-business";
    const businessDetails = fullDetails || recipientType === "small-medium-business" || recipientType === "microbusiness";
    return [
      optionalTlv("01", businessDetails ? additionalDataFields.billNumber : ""),
      optionalTlv("02", fullDetails ? additionalDataFields.mobileNumber : ""),
      optionalTlv("03", fullDetails ? additionalDataFields.storeLabel : ""),
      optionalTlv("04", fullDetails ? additionalDataFields.loyaltyNumber : ""),
      optionalTlv("05", additionalDataFields.referenceLabel),
      optionalTlv("06", fullDetails ? additionalDataFields.customerLabel : ""),
      optionalTlv("07", fullDetails ? additionalDataFields.terminalLabel : ""),
      optionalTlv("08", additionalDataFields.purpose),
    ].join("");
  }, [additionalDataFields, recipientType, technicalMode]);

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

  const qrExportSources: QrExportSource[] = [
    {
      id: "raw",
      label: "Raw EMV payload",
      description: "EMVCo payload for compatible payment scanners.",
      value: generatedPayload,
      qr: rawQr,
    },
  ];

  function updateCore<K extends Exclude<keyof CoreFields, "payloadFormat" | "initiationMethod">>(key: K, value: CoreFields[K]): void {
    setCoreFields((current) => ({ ...current, [key]: value }));
  }

  function updateMerchant<K extends Exclude<keyof MerchantAccountFields, "gui" | "scheme">>(key: K, value: MerchantAccountFields[K]): void {
    if (key === "fiAlias" || key === "branchAlias" || key === "participantCode") {
      setInstitutionBic("");
      setBranchIndex("");
    }
    setMerchantAccountFields((current) => ({ ...current, [key]: value }));
  }

  function updateAdditional<K extends keyof AdditionalDataFields>(key: K, value: AdditionalDataFields[K]): void {
    setAdditionalDataFields((current) => ({ ...current, [key]: value }));
  }

  async function generateQrs(): Promise<void> {
    try {
      const timestamp = generateTimestamp();
      const fieldsForGeneration = emvFields.map((field) => field.tag === "80" ? {
        ...field,
        value: optionalTlv("00", privateFields.gui) + optionalTlv("01", timestamp),
      } : field);
      const payloadForGeneration = buildEmvPayload(fieldsForGeneration);
      if (!coreFields.merchantName.trim() || !coreFields.merchantCity.trim() ||
          Object.values(merchantAccountFields).some((value) => !value.trim())) {
        setMessage(technicalMode ? "Enter a merchant name and all merchant account information fields." : "Enter the recipient name, choose a bank and branch, and enter the receiving account or merchant number.");
        return;
      }

      if (fieldsForGeneration.some((field) => field.value.trim().length > 99)) {
        setMessage(technicalMode ? "Each TLV field must fit its two-digit length (99 characters maximum). Shorten the account or additional data fields." : "There is too much account or reference information for this QR. Shorten your notes or reference and try again.");
        return;
      }

      if (amountMode === "fixed" && (!isValidAmount(coreFields.amount) || Number(coreFields.amount) <= 0)) {
        setMessage("Fixed amount must be a valid number, for example 3.50 or 25.00.");
        return;
      }

      setMessage("Generating QR codes...");

      const rawQrDataUrl = await QRCode.toDataURL(payloadForGeneration, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 380,
      });

      setRawQr(rawQrDataUrl);
      setGeneratedPayload(payloadForGeneration);
      setPrivateFields((current) => ({ ...current, requestTimestamp: timestamp }));
      const currencyCode = CURRENCY_OPTIONS.find((option) => option.value === coreFields.currency)?.label.match(/\b[A-Z]{3}\b/)?.[0] ?? coreFields.currency;
      setGeneratedFixedPrice(amountMode === "fixed" ? `${currencyCode} $${Number(coreFields.amount).toFixed(2)}` : "");
      setMessage("QR generated.");
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
    setRecipientType("small-medium-business");
    setInstitutionBic("");
    setBranchIndex("");
    setCoreFields({
      payloadFormat: "01",
      initiationMethod: "11",
      merchantCategoryCode: "0000",
      currency: "052",
      amount: "3.50",
      country: "BB",
      merchantName: "",
      merchantCity: "BRIDGETOWN",
    });

    setMerchantAccountFields({
      gui: BIMPAY_GUI,
      fiAlias: "",
      branchAlias: "",
      accountReference: EMPTY_ACCOUNT_REFERENCE,
      participantCode: "",
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
      purpose: "",
    });

    setPrivateFields({
      gui: BIMPAY_GUI,
      requestTimestamp: generateTimestamp(),
    });

    setAmountMode("variable");
    setAdvancedMode(false);
    setRawQr("");
    setGeneratedPayload("");
    setGeneratedFixedPrice("");
    setMessage("Form cleared.");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="utility-header rounded-lg p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="utility-title text-2xl font-bold">
              <img src={`${import.meta.env.BASE_URL}bimpay-logo.png`} alt="BiMPay" className="utility-logo" />
              <span>QR Utility</span>
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {technicalMode ? "Customise and inspect payment QR fields." : "Create a payment QR for your business, fundraiser or event."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a href={technicalMode ? "#/" : "#/customise"} className="rounded-lg border border-cyan-950/20 bg-white px-4 py-3 text-sm font-bold text-cyan-950 transition hover:bg-slate-50">
              {technicalMode ? "Back to QR creator" : "Experiment with QR Scheme"}
            </a>
            {technicalMode && (
            <button
              type="button"
              onClick={() => setAdvancedMode((current) => !current)}
              className="rounded-lg border border-cyan-950/20 bg-white px-4 py-3 text-sm font-bold text-cyan-950 transition hover:bg-slate-50"
            >
              {advancedMode ? "Hide Advanced" : "Show Advanced"}
            </button>
            )}

            <button
              type="button"
              onClick={resetToDefaults}
              className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-200"
            >
              Clear Form
            </button>
          </div>
        </div>
      </header>

      <p className="review-notice mt-4 text-sm text-slate-600">Unofficial utility: independent review build. Merchant details stay in this browser; no account or sign-in is required.</p>

      <main className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          {!technicalMode && <EditorSection title="Who is this QR for?">
            <SelectField
              label="Recipient type"
              value={recipientType}
              options={RECIPIENT_TYPES}
              onChange={(value) => {
                setRecipientType(value as RecipientType);
                if (value === "organisation") {
                  setExportTemplateId(exportTemplateId.startsWith("bimpay-landscape") ? "bimpay-landscape-donations" : "bimpay-donations");
                }
                setRawQr("");
                setGeneratedPayload("");
                setGeneratedFixedPrice("");
                setMessage("");
              }}
            />
          </EditorSection>}
          <EditorSection
            title={technicalMode ? "Payment Behaviour" : "Payment amount"}
            description={technicalMode ? "This separates EMVCo initiation semantics from independently observed payment-app amount behaviour." : undefined}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                label={technicalMode ? "Amount Mode" : organisation ? "How much will supporters give?" : "How much will customers pay?"}
                value={amountMode}
                onChange={(value) => setAmountMode(value as AmountMode)}
                options={[
                  { value: "variable", label: technicalMode ? "Variable amount" : organisation ? "Supporter enters the amount" : "Customer enters the amount" },
                  { value: "fixed", label: technicalMode ? "Fixed amount" : organisation ? "A set amount" : "A set price" },
                ]}
                helper={technicalMode ? 'Observed experimental behaviour: 54 = "***" may prompt for an amount.' : undefined}
              />

              {amountMode === "fixed" && (
                <Field
                  label={technicalMode ? "54 Amount" : organisation ? "Amount" : "Price"}
                  value={coreFields.amount}
                  onChange={(value) => updateCore("amount", value)}
                  helper="Use a numeric value such as 3.50 or 25.00."
                />
              )}

              {technicalMode && amountMode === "variable" && (
                <ReadOnlyField
                  label="54 Transaction Amount"
                  value="***"
                  helper="Some observed payment-app flows appear to treat this sentinel as variable amount."
                />
              )}
            </div>
          </EditorSection>

          <EditorSection
            title={technicalMode ? "Core EMVCo Fields" : organisation ? "Your organisation" : microBusiness ? "Your details" : "Your business"}
            description={technicalMode ? "Top-level fields in the EMV merchant-presented QR payload." : undefined}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {technicalMode && advancedMode && (
                <>
                  <ReadOnlyField label="00 Payload Format" value={coreFields.payloadFormat} />
                  <ReadOnlyField label="01 Initiation Method" value={coreFields.initiationMethod} helper="11 - Static." />
                </>
              )}

              <SelectField
                label={technicalMode ? "52 Merchant Category Code" : organisation ? "Organisation category" : microBusiness ? "Activity / payment category" : "Business category"}
                value={coreFields.merchantCategoryCode}
                onChange={(value) => updateCore("merchantCategoryCode", value)}
                options={technicalMode ? SORTED_MERCHANT_CATEGORY_OPTIONS : SORTED_MERCHANT_CATEGORY_OPTIONS.map((option) => ({ ...option, label: option.value === "0000" ? "Other / not specified" : option.label.replace(/^\d{4}\s*-\s*/, "") }))}
                helper={technicalMode ? "Common MCC presets for transport, retail, food, government, and test flows." : undefined}
              />
              {technicalMode ? <Field label="53 Currency" value={coreFields.currency} onChange={(value) => updateCore("currency", value)} helper="ISO 4217 numeric currency code. 052 = BBD." /> : <SelectField
                label={technicalMode ? "53 Currency" : "Currency"}
                value={coreFields.currency}
                onChange={(value) => updateCore("currency", value)}
                options={technicalMode ? CURRENCY_OPTIONS : CURRENCY_OPTIONS.map((option) => ({ ...option, label: option.label.replace(/^\d{3}\s*\u2014\s*/, "") }))}
                helper={technicalMode ? "ISO 4217 numeric currency code. 052 = BBD." : undefined}
              />}
              {technicalMode ? <Field label="58 Country" value={coreFields.country} onChange={(value) => updateCore("country", value)} helper="ISO 3166-1 alpha-2 country code." /> : <SelectField
                label={technicalMode ? "58 Country" : "Country"}
                value={coreFields.country}
                onChange={(value) => updateCore("country", value)}
                options={COUNTRY_OPTIONS}
                helper={technicalMode ? "ISO 3166-1 alpha-2 country code." : undefined}
              />}
              <Field label={technicalMode ? "59 Merchant Name" : organisation ? "Organisation name" : microBusiness ? "Name / trading name" : "Business name"} value={coreFields.merchantName} onChange={(value) => updateCore("merchantName", value)} helper="Up to 25 characters in the payment QR." maxLength={25} />
              {technicalMode && <Field label="60 Merchant City" value={coreFields.merchantCity} onChange={(value) => updateCore("merchantCity", value)} />}
            </div>
          </EditorSection>

          <EditorSection
            title={technicalMode ? "Tag 26 — Merchant Account Information" : "Where payments go"}
            description={technicalMode ? "Guided abstraction over scheme-specific merchant account/routing data." : undefined}
          >
            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                label={technicalMode ? "Financial institution" : "Bank or credit union"}
                value={institutionBic}
                options={[
                  { value: "", label: technicalMode ? "Custom / manual entry" : "Choose your bank or credit union" },
                  ...TRANSIT_DIRECTORY.map((institution) => ({ value: institution.bic, label: institution.partyName })),
                ]}
                onChange={(bic) => {
                  setInstitutionBic(bic);
                  setBranchIndex("");
                  if (bic) setMerchantAccountFields((current) => ({ ...current, fiAlias: bic, branchAlias: "", participantCode: "" }));
                }}
              />
              <SelectField
                label={technicalMode ? "Branch / service" : "Branch"}
                value={branchIndex}
                options={[
                  { value: "", label: "Choose a branch" },
                  ...(selectedInstitution?.branches.map((branch, index) => ({
                    value: String(index),
                    label: `${branch.addressLine1}${technicalMode ? ` - ${branch.transitCode}` : ""}${branch.discontinued ? " (discontinued)" : ""}`,
                    disabled: branch.discontinued,
                  })) ?? []),
                ]}
                onChange={(index) => {
                  setBranchIndex(index);
                  const branch = index === "" ? undefined : selectedInstitution?.branches[Number(index)];
                  if (branch && !branch.discontinued && selectedInstitution) {
                    setMerchantAccountFields((current) => ({ ...current, fiAlias: selectedInstitution.bic, branchAlias: selectedInstitution.bic, participantCode: branch.transitCode }));
                  } else {
                    setMerchantAccountFields((current) => ({ ...current, branchAlias: "", participantCode: "" }));
                  }
                }}
              />
            </div>
            {technicalMode && <p className="mb-4 text-xs text-slate-500">Branch directory: May 2026. Presets use Head Office BIC for 26.01/26.02 and Transit Code for 26.04. Codes remain editable.</p>}
            {branchIndex !== "" && selectedBranch?.note && <p className="mb-4 text-sm text-slate-600">{selectedBranch.note}</p>}
            {!technicalMode && <Field label={organisation ? "Organisation account number" : microBusiness ? "Receiving account number" : "Account / merchant number"} value={merchantAccountFields.accountReference} onChange={(value) => updateMerchant("accountReference", value)} />}
            {technicalMode && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {advancedMode && <ReadOnlyField label="26.00 GUI" value={merchantAccountFields.gui} />}

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

              {advancedMode && <ReadOnlyField label="26.11 Scheme" value={merchantAccountFields.scheme} />}
            </div>}

            {technicalMode && <TemplatePreview title="Tag 26 Template" value={merchantAccountTemplate} />}
          </EditorSection>

          <EditorSection
            title={technicalMode ? "Tag 62 — Additional Data" : organisation ? "Purpose & reference (optional)" : largeBusiness ? "Business payment details (optional)" : "Bill details & notes (optional)"}
            description={technicalMode ? "Optional nested labels for reference, bill number, terminal, purpose, or related metadata." : undefined}
            collapsible={!technicalMode}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!technicalMode && <>
                {!organisation && <Field label="Bill / invoice number" value={additionalDataFields.billNumber} onChange={(value) => updateAdditional("billNumber", value)} />}
                <Field label="Payment reference" value={additionalDataFields.referenceLabel} onChange={(value) => updateAdditional("referenceLabel", value)} />
                {largeBusiness && <>
                  <Field label="Business contact number" value={additionalDataFields.mobileNumber} onChange={(value) => updateAdditional("mobileNumber", value)} />
                  <Field label="Store / location reference" value={additionalDataFields.storeLabel} onChange={(value) => updateAdditional("storeLabel", value)} />
                  <Field label="Loyalty reference" value={additionalDataFields.loyaltyNumber} onChange={(value) => updateAdditional("loyaltyNumber", value)} />
                  <Field label="Customer reference" value={additionalDataFields.customerLabel} onChange={(value) => updateAdditional("customerLabel", value)} />
                  <Field label="Till / terminal reference" value={additionalDataFields.terminalLabel} onChange={(value) => updateAdditional("terminalLabel", value)} />
                </>}
              </>}
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{technicalMode ? "62.08 Purpose / Notes" : "Purpose / notes (optional)"}</span>
                <textarea
                  className="w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
                  rows={4}
                  value={additionalDataFields.purpose}
                  onChange={(event) => updateAdditional("purpose", event.target.value)}
                />
              </label>
              {technicalMode && (
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

            {technicalMode && <TemplatePreview title="Tag 62 Template" value={additionalDataTemplate || "No additional data fields set."} />}
          </EditorSection>

          {technicalMode && <EditorSection
            title="Tag 80 — Private Template"
            description="Optional private metadata fields."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {advancedMode && <ReadOnlyField label="80.00 GUI" value={privateFields.gui} />}
              <ReadOnlyField label="80.01 Request Timestamp / ID" value={privateFields.requestTimestamp} helper="Set automatically when you generate a QR." />
            </div>

            <TemplatePreview title="Tag 80 Template" value={privateTemplate} />
          </EditorSection>}

          <button
            type="button"
            onClick={generateQrs}
            className="w-full rounded-lg bg-cyan-950 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-slate-800"
          >
            {technicalMode ? "Generate QR Codes" : "Create Payment QR"}
          </button>

          {message && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">
              {message}
            </div>
          )}

        </section>

        <section className="space-y-6">
          <QrTemplateExporter
            recipientType={technicalMode ? undefined : recipientType}
            technicalMode={technicalMode}
            fixedPrice={generatedFixedPrice}
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
            sources={qrExportSources}
            onTemplateChange={setExportTemplateId}
          />

          {technicalMode && <><OutputBlock
            title="Raw EMV Payload"
            description="Generated merchant-presented payload."
            value={generatedPayload}
            qr={rawQr}
            onCopy={() => copyText(generatedPayload)}
          />

          <EditorSection
            title="Field Assembly Preview"
            description="Top-level TLV fields that will be assembled before CRC is calculated."
          >
            <div className="overflow-hidden rounded-lg border border-slate-200">
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
          </EditorSection></>}
        </section>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  helper?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}

function Field({ label, value, placeholder, helper, maxLength, onChange }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
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
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
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
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
}

function SelectField({ label, value, helper, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <select
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
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
  collapsible?: boolean;
}

function EditorSection({ title, description, children, collapsible = false }: EditorSectionProps) {
  if (collapsible) {
    return (
      <details className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">{title}</summary>
        <div className="mt-5">{children}</div>
      </details>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-sm font-bold text-slate-950">{title}</div>
      <div className="rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-700 break-all shadow-inner">
        {value}
      </div>
    </div>
  );
}

interface QrTemplateExporterProps {
  recipientType?: RecipientType;
  technicalMode?: boolean;
  fixedPrice: string;
  amount: string;
  amountMode: AmountMode;
  merchantCity: string;
  merchantName: string;
  reference: string;
  selectedSourceId: QrExportSourceId;
  selectedTemplateId: QrExportTemplateId;
  sources: QrExportSource[];
  onTemplateChange: (value: QrExportTemplateId) => void;
}

function QrTemplateExporter({
  recipientType = "small-medium-business",
  technicalMode = false,
  fixedPrice,
  amount,
  amountMode,
  merchantCity,
  merchantName,
  reference,
  selectedSourceId,
  selectedTemplateId,
  sources,
    onTemplateChange,
}: QrTemplateExporterProps) {
  const [exportMessage, setExportMessage] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [donationCause, setDonationCause] = useState("");
  const [fixedDescription, setFixedDescription] = useState("");
  const [outputSize, setOutputSize] = useState<QrOutputSize>("a4");
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [renderedPreviewKey, setRenderedPreviewKey] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const selectedTemplate =
    QR_EXPORT_TEMPLATES.find((template) => template.id === selectedTemplateId) ??
    QR_EXPORT_TEMPLATES[0];
  const orientation = selectedTemplate.id.startsWith("bimpay-landscape") ? "landscape" : "portrait";
  const selectedLayout = TEMPLATE_LAYOUTS.find((layout) => layout.portrait === selectedTemplate.id || layout.landscape === selectedTemplate.id) ?? TEMPLATE_LAYOUTS[0];
  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const hasGeneratedQr = sources.some((source) => source.qr);
  const selectedPaperLabel = (size: QrOutputSize) => technicalMode
    ? outputDimensions(selectedTemplate.id, size).label
    : `${size === "original" ? "Small sign" : size.toUpperCase()} - ${orientation === "landscape" ? "Landscape" : "Portrait"}`;
  const amountLabel =
    amountMode === "variable" ? `${recipientType === "organisation" ? "Supporter" : "Customer"} enters amount` : `Fixed amount BBD ${amount}`;
  const descriptionError = selectedTemplate.id.endsWith("fixed") && fixedDescription.length > 30
    ? `Description is ${fixedDescription.length} characters. Remove ${fixedDescription.length - 30} to fit the 30-character limit (including spaces).`
    : "";
  const previewKey = JSON.stringify([selectedSource.value, selectedTemplate.id, outputSize, donationCause, fixedDescription, fixedPrice, amount, amountMode, merchantCity, merchantName, reference]);
  const previewIsCurrent = renderedPreviewKey === previewKey;
  const activePreviewDataUrl = selectedSource.qr && !descriptionError && previewIsCurrent ? previewDataUrl : "";
  const previewPlaceholder = descriptionError || (!selectedSource.qr
    ? "Generate the selected QR source to preview this template."
    : (previewIsCurrent && previewMessage) || "Rendering preview...");

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
      donationCause,
      fixedDescription,
      fixedPrice,
      outputSize,
      qrPayload: source.value,
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
      donationCause,
      fixedDescription,
      fixedPrice,
      outputSize,
      qrPayload: selectedSource.value,
    })
      .then((dataUrl) => {
        if (cancelled) return;
        setPreviewDataUrl(dataUrl);
        setRenderedPreviewKey(previewKey);
        setPreviewMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewDataUrl("");
        setRenderedPreviewKey(previewKey);
        setPreviewMessage(error instanceof Error ? error.message : "Could not render preview.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    previewKey,
    outputSize,
    selectedSource.value,
    fixedDescription,
    fixedPrice,
    donationCause,
    amount,
    amountMode,
    merchantCity,
    merchantName,
    reference,
    selectedSource.label,
    selectedSource.qr,
    selectedTemplate.id,
  ]);

  async function downloadTemplate(): Promise<void> {
    try {
      const dataUrl = await createTemplatePng();
      downloadDataUrl(
        dataUrl,
        `${safeFileName(`${merchantName}-${selectedTemplate.title}-${outputSize}`)}.png`
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
        `${safeFileName(`${merchantName}-${selectedTemplate.title}-${outputSize}`)}.png`
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

  async function downloadTemplatePdf(): Promise<void> {
    setExportingPdf(true);
    setExportMessage("Preparing PDF...");
    try {
      const imageData = await createTemplatePng();
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const landscape = selectedTemplate.id.startsWith("bimpay-landscape");
      const millimetresToPoints = (value: number) => value * 72 / 25.4;
      let pageWidth: number;
      let pageHeight: number;
      if (outputSize === "original") {
        const dimensions = templateDimensions(selectedTemplate.id);
        pageWidth = dimensions.width / 4;
        pageHeight = dimensions.height / 4;
      } else {
        const [shortSide, longSide] = outputSize === "a4" ? [210, 297] : [148, 210];
        pageWidth = millimetresToPoints(landscape ? longSide : shortSide);
        pageHeight = millimetresToPoints(landscape ? shortSide : longSide);
      }
      const page = pdf.addPage([pageWidth, pageHeight]);
      const artwork = await pdf.embedPng(imageData);
      page.drawImage(artwork, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      pdf.setTitle(`${selectedTemplate.title} - ${merchantName || "Payment QR"}`);
      pdf.setCreator("BiMPay QR Utility");
      const bytes = await pdf.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      downloadDataUrl(url, `${safeFileName(`${merchantName}-${selectedTemplate.title}-${outputSize}`)}.pdf`);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportMessage("Template PDF downloaded.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not export PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <EditorSection
      title={technicalMode ? "Export Templates" : "Print or share"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Template</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
            value={selectedLayout.portrait}
            onChange={(event) => {
              const layout = TEMPLATE_LAYOUTS.find((item) => item.portrait === event.target.value);
              if (layout) onTemplateChange(layout[orientation]);
            }}
          >
            {TEMPLATE_LAYOUTS.map((layout) => <option key={layout.portrait} value={layout.portrait}>{layout.label}</option>)}
          </select>
        </label>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold text-slate-700">Orientation</legend>
          <div className="flex gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1">
            {(["portrait", "landscape"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                aria-pressed={orientation === direction}
                onClick={() => onTemplateChange(selectedLayout[direction])}
                className={`min-w-0 flex-1 rounded-md px-2 py-2 text-sm font-semibold transition ${orientation === direction ? "bg-cyan-950 text-white" : "text-slate-600 hover:bg-white"}`}
              >
                {direction === "portrait" ? "Portrait" : "Landscape"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">{technicalMode ? "Output size" : "Paper size"}</span>
        <select className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm" value={outputSize} onChange={(event) => setOutputSize(event.target.value as QrOutputSize)}>
          {Object.keys(QR_OUTPUT_SIZES).map((value) => <option key={value} value={value}>{selectedPaperLabel(value as QrOutputSize)}</option>)}
        </select>
      </label>

      {selectedTemplate.id.endsWith("fixed") && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{recipientType === "organisation" ? "Payment description" : "Item / Description"}</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            value={fixedDescription}
            aria-invalid={Boolean(descriptionError)}
            aria-describedby="fixed-description-feedback"
            onChange={(event) => setFixedDescription(event.target.value)}
          />
          <span id="fixed-description-feedback" aria-live="polite" className={`mt-1 block text-xs ${descriptionError ? "text-red-700" : "text-slate-500"}`}>
            {descriptionError || `${fixedDescription.length}/30 characters (including spaces)`}
          </span>
        </label>
      )}

      {selectedTemplate.id.endsWith("donations") && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Give to / Cause</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            value={donationCause}
            maxLength={30}
            onChange={(event) => setDonationCause(event.target.value.slice(0, 30))}
          />
          <span className="mt-1 block text-xs text-slate-500">{donationCause.length}/30</span>
        </label>
      )}

      <div className="mt-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-4">
            <div
              className="grid h-28 w-28 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-2"
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
                {selectedTemplate.title}
              </div>
              <div className="mt-2 text-xl font-black text-slate-950 break-words">
                {merchantName || "Your business name"}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                {amountLabel}
              </div>
              <div className="mt-3 text-xs leading-5 text-slate-500">
                {hasGeneratedQr ? "Your payment QR is ready." : "Create your payment QR to download or share it."}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black text-slate-950">Printable QR preview</div>
            <div className="text-xs font-semibold text-slate-500">
              Matches the exported PNG and PDF for the selected layout and size.
            </div>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
            {selectedPaperLabel(outputSize)}
          </div>
        </div>

        <div className="grid min-h-72 place-items-center rounded-lg border border-slate-200 bg-white p-4">
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
          disabled={!selectedSource.qr || Boolean(descriptionError)}
          className="rounded-lg bg-cyan-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Download as PNG
        </button>
        <button
          type="button"
          onClick={() => void downloadTemplatePdf()}
          disabled={!selectedSource.qr || Boolean(descriptionError) || exportingPdf}
          className="rounded-lg border border-cyan-950 bg-white px-4 py-3 text-sm font-black text-cyan-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        >
          {exportingPdf ? "Preparing PDF..." : "Download as PDF"}
        </button>
        <button
          type="button"
          onClick={() => void shareTemplate()}
          disabled={!selectedSource.qr || Boolean(descriptionError)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          Share printable QR
        </button>
      </div>

      {exportMessage && (
        <div role="status" className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
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
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Copy
          </button>

          <button
            type="button"
            onClick={shareQr}
            disabled={!qr}
            className="rounded-lg bg-cyan-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Share QR
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-100 p-4 font-mono text-xs leading-5 text-slate-800 break-all">
        {value || "Generate QR codes to populate this output."}
      </div>

      {qr && (
        <div className="mt-5 flex justify-center">
          <img
            src={qr}
            alt={`${title} QR code`}
            className="h-72 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          />
        </div>
      )}

      {shareMessage && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
          {shareMessage}
        </div>
      )}
    </div>
  );
}

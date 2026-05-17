import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import QRCode from "qrcode";

type AmountMode = "variable" | "fixed";

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

const MERCHANT_CATEGORY_OPTIONS = [
  { value: "4111", label: "4111 — Local/Suburban Passenger Transportation" },
  { value: "4121", label: "4121 — Taxicabs / Limousines" },
  { value: "4131", label: "4131 — Bus Lines" },
  { value: "4784", label: "4784 — Tolls / Road Fees" },
  { value: "5411", label: "5411 — Grocery Stores / Supermarkets" },
  { value: "5499", label: "5499 — Miscellaneous Food Stores" },
  { value: "5812", label: "5812 — Eating Places / Restaurants" },
  { value: "5814", label: "5814 — Fast Food Restaurants" },
  { value: "5541", label: "5541 — Service Stations" },
  { value: "5699", label: "5699 — Miscellaneous Apparel" },
  { value: "7299", label: "7299 — Miscellaneous Personal Services" },
  { value: "8398", label: "8398 — Charitable / Social Service Organizations" },
  { value: "9399", label: "9399 — Government Services" },
  { value: "0000", label: "0000 — Unspecified / Test" },
];

const FINANCIAL_INSTITUTION_OPTIONS = [
  { label: "Test Bank 1", fiAlias: "TESTROC1", participantCode: "333331" },
  { label: "Test Bank 2", fiAlias: "TESTROC2", participantCode: "333332" },
  { label: "RBC Royal Bank", fiAlias: "RBC", participantCode: "333333" },
  { label: "Sagicor Bank", fiAlias: "SAGICOR", participantCode: "333334" },
  { label: "BWU Credit Union", fiAlias: "BWUCU", participantCode: "333335" },
  { label: "Massy Finance", fiAlias: "MASSY", participantCode: "333336" },
  { label: "Republic Bank", fiAlias: "REPBANK", participantCode: "333337" },
  { label: "CIBC Caribbean", fiAlias: "CIBC", participantCode: "333338" },
];

const BRANCH_OPTIONS: Record<string, Array<{ label: string; value: string }>> = {
  TESTROC1: [
    { label: "Test Main 1", value: "TESTROC1" },
    { label: "Bridgetown Main", value: "BTOWN" },
    { label: "Warrens Corporate", value: "WARRENS" },
    { label: "Airport Services", value: "AIRPORT" },
  ],
  TESTROC2: [
    { label: "Test Main 2", value: "TESTROC2" },
    { label: "South Coast", value: "SCOAST" },
    { label: "Speightstown", value: "SPEIGHTS" },
  ],
  RBC: [
    { label: "Broad Street", value: "BROADST" },
    { label: "Warrens", value: "WARRENS" },
    { label: "Hastings", value: "HASTINGS" },
  ],
  SAGICOR: [
    { label: "Worthing", value: "WORTHING" },
    { label: "Bridgetown", value: "BTOWN" },
  ],
  BWUCU: [
    { label: "Head Office", value: "HEADOFF" },
    { label: "Warrens", value: "WARRENS" },
  ],
  MASSY: [
    { label: "Finance HQ", value: "FINHQ" },
    { label: "Sheraton", value: "SHERATON" },
  ],
  REPBANK: [
    { label: "Broad Street", value: "BROADST" },
    { label: "Six Roads", value: "SIXROADS" },
    { label: "Holetown", value: "HOLETOWN" },
  ],
  CIBC: [
    { label: "Warrens", value: "WARRENS" },
    { label: "Broad Street", value: "BROADST" },
    { label: "Bridgetown Corporate", value: "BTCORP" },
  ],
};

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

export default function CreatePaymentQrPage() {
  const [coreFields, setCoreFields] = useState<CoreFields>({
    payloadFormat: "01",
    initiationMethod: "11",
    merchantCategoryCode: "4111",
    currency: "052",
    amount: "3.50",
    country: "BB",
    merchantName: "Sample Bus",
    merchantCity: "Bridgetown",
  });

  const [merchantAccountFields, setMerchantAccountFields] =
    useState<MerchantAccountFields>({
      gui: "bb.org.cb.mpqr",
      fiAlias: "TESTROC1",
      branchAlias: "TESTROC1",
      accountReference: "300000207578787",
      participantCode: "333331",
      scheme: "QRBB",
    });

  const [additionalDataFields, setAdditionalDataFields] = useState<AdditionalDataFields>({
    billNumber: "",
    mobileNumber: "",
    storeLabel: "",
    loyaltyNumber: "",
    referenceLabel: "",
    customerLabel: "",
    terminalLabel: "",
    purpose: "Bus fare",
  });

  const [privateFields, setPrivateFields] = useState<PrivateFields>({
    gui: "bb.org.cb.mpqr",
    requestTimestamp: "20260516093000",
  });

  const [token, setToken] = useState("");
  const [embeddedPaymentLink, setEmbeddedPaymentLink] = useState("");
  const [tokenizedPaymentLink, setTokenizedPaymentLink] = useState("");
  const [rawQr, setRawQr] = useState("");
  const [embeddedLinkQr, setEmbeddedLinkQr] = useState("");
  const [tokenizedLinkQr, setTokenizedLinkQr] = useState("");
  const [message, setMessage] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("variable");
  const [advancedMode, setAdvancedMode] = useState(false);

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
      if (amountMode === "fixed" && !isValidAmount(coreFields.amount)) {
        setMessage("Fixed amount must be a valid number, for example 3.50 or 25.00.");
        return;
      }

      setMessage("Generating QR codes...");

      const embeddedLink = `${window.location.origin}/pay?emv=${encodeURIComponent(emvPayload)}`;

      let createdToken = "";
      let tokenizedLink = "";

      try {
        const response = await fetch("/api/payment-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emvPayload }),
        });

        if (response.ok) {
          const record = (await response.json()) as PaymentLinkRecord;
          createdToken = record.token;
          tokenizedLink = `${window.location.origin}/pay/${record.token}`;
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

      setToken(createdToken);
      setRawQr(rawQrDataUrl);
      setEmbeddedPaymentLink(embeddedLink);
      setTokenizedPaymentLink(tokenizedLink);
      setEmbeddedLinkQr(embeddedLinkQrDataUrl);
      setTokenizedLinkQr(tokenizedLinkQrDataUrl);
      setMessage(
        tokenizedLink
          ? "Raw, embedded-link, and tokenized QR codes generated."
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
      merchantCategoryCode: "4111",
      currency: "052",
      amount: "3.50",
      country: "BB",
      merchantName: "Sample Bus",
      merchantCity: "Bridgetown",
    });

    setMerchantAccountFields({
      gui: "bb.org.cb.mpqr",
      fiAlias: "TESTROC1",
      branchAlias: "TESTROC1",
      accountReference: "300000207578787",
      participantCode: "333331",
      scheme: "QRBB",
    });

    setAdditionalDataFields({
      billNumber: "",
      mobileNumber: "",
      storeLabel: "",
      loyaltyNumber: "",
      referenceLabel: "",
      customerLabel: "",
      terminalLabel: "",
      purpose: "Bus fare",
    });

    setPrivateFields({
      gui: "bb.org.cb.mpqr",
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
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create BiMPay / EMVCo QR</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Edit EMVCo fields while modelling observed BiMPay behaviour: 54 = *** behaves as variable amount, while a numeric 54 behaves as a fixed payment request.
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

      <main className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <EditorSection
            title="Payment Behaviour"
            description="This separates EMVCo initiation semantics from observed BiMPay amount behaviour."
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
                helper='Observed BiMPay behaviour: 54 = "***" prompts payer to enter amount.'
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
                  helper="BiMPay appears to treat this sentinel as variable amount."
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
                    helper="EMVCo semantic field. BiMPay amount behaviour appears controlled separately by tag 54."
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

              <SelectField
                label="26.01 Financial Institution Alias"
                value={merchantAccountFields.fiAlias}
                onChange={(value) => {
                  const selected = FINANCIAL_INSTITUTION_OPTIONS.find((option) => option.fiAlias === value);
                  if (!selected) return;

                  const defaultBranch = BRANCH_OPTIONS[selected.fiAlias]?.[0]?.value ?? "";

                  setMerchantAccountFields((current) => ({
                    ...current,
                    fiAlias: selected.fiAlias,
                    participantCode: selected.participantCode,
                    branchAlias: defaultBranch,
                  }));
                }}
                options={FINANCIAL_INSTITUTION_OPTIONS.map((option) => ({
                  value: option.fiAlias,
                  label: option.label,
                }))}
                helper="Selecting an FI auto-populates its participant code."
              />

              <SelectField
                label="26.02 Branch / Service Alias"
                value={merchantAccountFields.branchAlias}
                onChange={(value) => updateMerchant("branchAlias", value)}
                options={BRANCH_OPTIONS[merchantAccountFields.fiAlias] ?? []}
                helper="Sample branch/service alias for the selected FI."
              />

              <Field label="26.03 Account / Merchant Reference" value={merchantAccountFields.accountReference} onChange={(value) => updateMerchant("accountReference", value)} />

              <ReadOnlyField
                label="26.04 Participant Code"
                value={merchantAccountFields.participantCode}
                helper="Derived from selected Financial Institution."
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
            description="Experimental/private template used to mimic BiMPay-specific metadata."
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

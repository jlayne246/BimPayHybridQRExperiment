import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import StandaloneQrDialog from "./StandaloneQrDialog";
import StandaloneQrOutput from "./StandaloneQrOutput";
import { BIMPAY_GUI, BIMPAY_SCHEME, buildBiMPayFields, buildMerchantAccount, buildAdditionalData, buildPrivateMetadata, buildEmvPayload, generateTimestamp, isValidAmount, renderPaymentQr, prepareQrLogo } from "bimpay-qr-generator";
import type { EmvField, CoreFields, MerchantAccountFields, AdditionalDataFields, PrivateFields } from "bimpay-qr-generator";
import { renderPaymentCard, exportPaymentCardPdf, QR_OUTPUT_SIZES, outputDimensions, templateDimensions } from "bimpay-payment-cards";
import type { QrExportTemplateId, QrOutputSize } from "bimpay-payment-cards";
type QrExportSourceId = "raw";
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
  { value: "small-medium-business", label: "Small or medium business" },
  { value: "large-business", label: "Large/multi-branch business or corporation" },
  { value: "organisation", label: "Charity, non-profit, social organisation or individual cause" },
  { value: "microbusiness", label: "Individual or microbusiness" },
];
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
  // { value: "US", label: "US — United States" },
  // { value: "CA", label: "CA — Canada" },
  // { value: "GB", label: "GB — United Kingdom" },
  // { value: "TT", label: "TT — Trinidad and Tobago" },
  // { value: "JM", label: "JM — Jamaica" },
  // { value: "GY", label: "GY — Guyana" },
  // { value: "LC", label: "LC — Saint Lucia" },
  // { value: "VC", label: "VC — Saint Vincent and the Grenadines" },
  // { value: "AG", label: "AG — Antigua and Barbuda" },
];

const CURRENCY_OPTIONS = [
  { value: "052", label: "052 — BBD / Barbados Dollar" },
  // { value: "840", label: "840 — USD / US Dollar" },
  // { value: "124", label: "124 — CAD / Canadian Dollar" },
  // { value: "826", label: "826 — GBP / Pound Sterling" },
  // { value: "978", label: "978 — EUR / Euro" },
  // { value: "780", label: "780 — TTD / Trinidad and Tobago Dollar" },
  // { value: "388", label: "388 — JMD / Jamaican Dollar" },
  // { value: "328", label: "328 — GYD / Guyana Dollar" },
  // { value: "951", label: "951 — XCD / East Caribbean Dollar" },
];

const EMPTY_ACCOUNT_REFERENCE = "";

function draftTemplate(build: () => string, input: unknown): string {
  try { return build(); } catch { return `Invalid TLV input: ${JSON.stringify(input)}`; }
}

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
  { label: "BiMPay Accepted Here Template", portrait: "bimpay-accepted", landscape: "bimpay-landscape" },
  { label: "[Name] Accepts QR Payments Template", portrait: "bimpay-merchant", landscape: "bimpay-landscape-merchant" },
  { label: "Donations QR Template", portrait: "bimpay-donations", landscape: "bimpay-landscape-donations" },
  { label: "Fixed Price QR Template", portrait: "bimpay-fixed", landscape: "bimpay-landscape-fixed" },
] as const;

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

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export default function Generator() {
  const [recipientType, setRecipientType] = useState<RecipientType>("small-medium-business");
  const microBusiness = recipientType === "microbusiness";
  const organisation = recipientType === "organisation";
  const largeBusiness = recipientType === "large-business";
  const [technicalMode, setTechnicalMode] = useState(() => window.location.hash === "#/customise");
   const [isDonation, setIsDonation] = useState(false);
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

  const [generatedFingerprint, setGeneratedFingerprint] = useState("");
  const [rawQr, setRawQr] = useState("");
  const [showStandaloneQr, setShowStandaloneQr] = useState(false);
  const [generatedPayload, setGeneratedPayload] = useState("");
  const [generatedFixedPrice, setGeneratedFixedPrice] = useState("");
  const [message, setMessage] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("variable");
  const [qrLogo, setQrLogo] = useState("");
  const [logoError, setLogoError] = useState("");
  const logoFileInput = useRef<HTMLInputElement>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [institutionBic, setInstitutionBic] = useState("");
  const [branchIndex, setBranchIndex] = useState("");
  const selectedInstitution = TRANSIT_DIRECTORY.find((institution) => institution.bic === institutionBic);
  const selectedBranch = selectedInstitution?.branches[Number(branchIndex)];
  const [exportTemplateId, setExportTemplateId] =
    useState<QrExportTemplateId>("bimpay-accepted");
  const exportSourceId: QrExportSourceId = "raw";

  const merchantAccountTemplate = useMemo(() => {
    return draftTemplate(() => buildMerchantAccount(merchantAccountFields), merchantAccountFields);
  }, [merchantAccountFields]);

  const includedAdditionalData = useMemo(() => {
    const fullDetails = technicalMode || recipientType === "large-business";
    const businessDetails = fullDetails || recipientType === "small-medium-business" || recipientType === "microbusiness";
    return {
      billNumber: businessDetails ? additionalDataFields.billNumber : "",
      mobileNumber: fullDetails ? additionalDataFields.mobileNumber : "",
      storeLabel: fullDetails ? additionalDataFields.storeLabel : "",
      loyaltyNumber: fullDetails ? additionalDataFields.loyaltyNumber : "",
      referenceLabel: additionalDataFields.referenceLabel,
      customerLabel: fullDetails ? additionalDataFields.customerLabel : "",
      terminalLabel: fullDetails ? additionalDataFields.terminalLabel : "",
      purpose: additionalDataFields.purpose,
    };
  }, [additionalDataFields, recipientType, technicalMode]);

  const additionalDataTemplate = useMemo(
    () => draftTemplate(() => buildAdditionalData(includedAdditionalData), includedAdditionalData),
    [includedAdditionalData]
  );

  const privateTemplate = useMemo(() => {
    return buildPrivateMetadata(privateFields.gui, privateFields.requestTimestamp);
  }, [privateFields]);

  const emvFields = useMemo<EmvField[]>(() => {
    const input = {
      ...coreFields, ...merchantAccountFields, amountMode,
      additionalData: includedAdditionalData,
      privateGui: privateFields.gui, timestamp: privateFields.requestTimestamp,
    };
    try { return buildBiMPayFields(input); }
    catch { return [{ tag: "26", value: `Invalid TLV input: ${JSON.stringify(input)}` }]; }
  }, [coreFields, merchantAccountFields, amountMode, includedAdditionalData, privateFields]);

  const currentFingerprint = useMemo(
    () =>
      JSON.stringify({
        fields: emvFields.filter((field) => field.tag !== "80"),
        privateGui: privateFields.gui,
        logo: qrLogo,
      }),
    [emvFields, privateFields.gui, qrLogo]
  );
    
  const qrIsCurrent =
    Boolean(generatedPayload) &&
    generatedFingerprint === currentFingerprint;

  useEffect(() => {
    if (!qrIsCurrent) setShowStandaloneQr(false);
  }, [qrIsCurrent]);

  const generationIdRef = useRef(0);
  const [generating, setGenerating] = useState(false);

  const currentFingerprintRef = useRef(currentFingerprint);
  currentFingerprintRef.current = currentFingerprint;

  const qrExportSources: QrExportSource[] = [
    {
      id: "raw",
      label: "Raw EMV payload",
      description: "EMVCo payload for compatible payment scanners.",
      value: qrIsCurrent ? generatedPayload : "",
      qr: qrIsCurrent ? rawQr : "",
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
    const generationId = ++generationIdRef.current;
    const fingerprintAtStart = currentFingerprint;
    
    setGenerating(true);
    
    try {
      const timestamp = generateTimestamp();
      const fieldsForGeneration = emvFields.map((field) => field.tag === "80" ? {
        ...field,
        value: buildPrivateMetadata(privateFields.gui, timestamp),
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

      const rawQrDataUrl = await renderPaymentQr(
        payloadForGeneration,
        380,
        qrLogo,
        4
      );

      if (generationId !== generationIdRef.current) {
        return;
      }
      
      if (currentFingerprintRef.current !== fingerprintAtStart) {
        setMessage("Payment details changed. Generate the QR again.");
        return;
      }
      
      setRawQr(rawQrDataUrl);
      setGeneratedPayload(payloadForGeneration);
      setGeneratedFingerprint(fingerprintAtStart);
      setPrivateFields((current) => ({ ...current, requestTimestamp: timestamp }));
      const currencyCode = CURRENCY_OPTIONS.find((option) => option.value === coreFields.currency)?.label.match(/\b[A-Z]{3}\b/)?.[0] ?? coreFields.currency;
      setGeneratedFixedPrice(amountMode === "fixed" ? `${currencyCode} $${Number(coreFields.amount).toFixed(2)}` : "");
      setMessage("QR generated.");
    } catch (error) {
      if (generationId !== generationIdRef.current) return;
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Could not generate QR codes.");
    } finally {
        if (generationId === generationIdRef.current) {
          setGenerating(false);
      }
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
    generationIdRef.current += 1;
    setGenerating(false);
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
    setQrLogo("");
    setLogoError("");
    if (logoFileInput.current) logoFileInput.current.value = "";
    setAdvancedMode(false);
    setRawQr("");
    setGeneratedPayload("");
    setGeneratedFixedPrice("");
    setMessage("Form cleared.");
    setIsDonation(false);
    setExportTemplateId("bimpay-accepted");
    setGeneratedFingerprint("");
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
          {!technicalMode && (
            <EditorSection title="Who is this QR for?">
              <div className="space-y-4">
                <SelectField
                  label="Recipient type"
                  value={recipientType}
                  options={RECIPIENT_TYPES}
                  onChange={(value) => {
                    setRecipientType(value as RecipientType);
                    setIsDonation(false);

                    setExportTemplateId((current) => {
                      if (!current.endsWith("donations")) return current;
                    
                      return current.startsWith("bimpay-landscape")
                        ? "bimpay-landscape"
                        : "bimpay-accepted";
                    });
                              
                    // setRawQr("");
                    // setGeneratedPayload("");
                    // setGeneratedFixedPrice("");
                    setMessage("");
                  }}
                />
          
                {organisation && (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isDonation}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsDonation(checked);
                      
                        setExportTemplateId((current) => {
                          const landscape = current.startsWith("bimpay-landscape");
                      
                          return checked
                            ? landscape
                              ? "bimpay-landscape-donations"
                              : "bimpay-donations"
                            : landscape
                              ? "bimpay-landscape"
                              : "bimpay-accepted";
                        });
                      }}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      This QR code is for charitable donations
                    </span>
                  </label>
                )}
              </div>
            </EditorSection>
          )}
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
                helper={technicalMode ? '"***" may prompt for an amount.' : undefined}
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
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {amountMode === "fixed"
                ? `This QR will request a fixed payment of BBD $${Number(coreFields.amount || 0).toFixed(2)}.`
                : "The payer will be prompted to enter an amount if their payment app supports variable-amount QR codes."}
            </div>
            {organisation && isDonation && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Donation QR codes identify the recipient and payment
                purpose but do not verify charitable registration,
                eligibility for tax relief, or the intended use of funds.
              </p>
            )}
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

          <EditorSection title="QR logo (optional)">
            <input ref={logoFileInput} type="file" aria-label="Upload QR logo" className="block w-full min-w-0 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-slate-100 file:px-4 file:py-2 file:font-semibold file:text-slate-900 hover:file:bg-slate-200" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
                setLogoError("Choose a PNG, JPEG or WebP image under 2 MB.");
                return;
              }
              try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () => reject(new Error("Could not read this image."));
                  reader.readAsDataURL(file);
                });
                setQrLogo(await prepareQrLogo(dataUrl));
                setLogoError("");
                // setRawQr("");
                // setGeneratedPayload("");
              } catch {
                setLogoError("Could not load this image. Choose another file.");
              }
            }} />
            {qrLogo && <div className="mt-3 flex items-center gap-3">
              <img src={qrLogo} alt="Uploaded QR logo" className="h-16 w-16 object-contain" />
              <button
                type="button"
                onClick={() => {
                  setQrLogo("");
                  // setRawQr("");
                  // setGeneratedPayload("");
                  if (logoFileInput.current) logoFileInput.current.value = "";
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 focus:outline-none focus:ring-4 focus:ring-red-100 active:bg-red-200"
              >
                Remove Logo
              </button>
            </div>}
            {logoError && <p role="alert" className="mt-2 text-sm text-red-700">{logoError}</p>}
          </EditorSection>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚠️</span>
          
              <div>
                <p className="text-sm font-bold text-amber-950">
                  Verify payment details
                </p>
          
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  Ensure the recipient name, financial institution,
                  branch and receiving account number are correct.
                  This utility does not verify account ownership.
                </p>
              </div>
            </div>
          </div>

          {generatedPayload && !qrIsCurrent && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900"
            >
              Payment details have changed. Generate the QR again
              before downloading or sharing your payment sign.
            </div>
          )}
          
          <button
            type="button"
            onClick={generateQrs}
            disabled={generating}
            className="w-full rounded-lg bg-cyan-950 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating
              ? "Generating QR..."
              : technicalMode
                ? "Generate QR Codes"
                : "Create Payment QR"}
          </button>

          {message && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">
              {message}
            </div>
          )}

          {qrIsCurrent && (
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Before displaying or sharing this QR, scan it with a
              compatible payment app and confirm that the recipient
              and payment details are correct.
            </p>
          )}

          {showStandaloneQr && qrIsCurrent && <StandaloneQrDialog
            payload={generatedPayload} logo={qrLogo} merchantName={coreFields.merchantName}
            fixedPrice={generatedFixedPrice} onClose={() => setShowStandaloneQr(false)}
          />}
        </section>

        <section className="space-y-6">
          <QrTemplateExporter
            logo={qrLogo}
            recipientType={technicalMode ? undefined : recipientType}
            technicalMode={technicalMode}
            fixedPrice={qrIsCurrent ? generatedFixedPrice : ""}
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
            onOpenStandaloneQr={() => setShowStandaloneQr(true)}
            onTemplateChange={setExportTemplateId}
            isDonation={isDonation}
          />

          {technicalMode && <><OutputBlock
            title="Raw EMV Payload"
            description="Generated merchant-presented payload."
            value={qrIsCurrent ? generatedPayload : ""}
            qr={qrIsCurrent ? rawQr : ""}
            onCopy={() => copyText(qrIsCurrent ? generatedPayload : "")}
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
  logo: string;
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
  onOpenStandaloneQr: () => void;
  onTemplateChange: (value: QrExportTemplateId) => void;
  isDonation: boolean;
}

function QrTemplateExporter({
  logo,
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
  onOpenStandaloneQr,
  isDonation,
}: QrTemplateExporterProps) {
  const [outputsInitiallyOpen] = useState(() => window.innerWidth >= 768);
  const [exportMessage, setExportMessage] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [donationCause, setDonationCause] = useState("");
  const [fixedDescription, setFixedDescription] = useState("");
  const [outputSize, setOutputSize] = useState<QrOutputSize>("a4");
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [renderedPreviewKey, setRenderedPreviewKey] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const isLandscape = selectedTemplateId.startsWith("bimpay-landscape");
  const donation = recipientType === "organisation" && isDonation;
  
  const templateId =
    amountMode === "fixed"
      ? isLandscape
        ? "bimpay-landscape-fixed"
        : "bimpay-fixed"
      : donation
        ? isLandscape
          ? "bimpay-landscape-donations"
          : "bimpay-donations"
        : selectedTemplateId.endsWith("fixed")
          ? isLandscape
            ? "bimpay-landscape"
            : "bimpay-accepted"
          : selectedTemplateId;
  const selectedTemplate =
    QR_EXPORT_TEMPLATES.find((template) => template.id === templateId) ??
    QR_EXPORT_TEMPLATES[0];
  const orientation = selectedTemplate.id.startsWith("bimpay-landscape") ? "landscape" : "portrait";
  const selectedLayout = TEMPLATE_LAYOUTS.find((layout) => layout.portrait === selectedTemplate.id || layout.landscape === selectedTemplate.id) ?? TEMPLATE_LAYOUTS[0];
  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const selectedPaperLabel = (size: QrOutputSize) => technicalMode
    ? outputDimensions(selectedTemplate.id, size).label
    : `${size === "original" ? "Small sign" : size.toUpperCase()} - ${orientation === "landscape" ? "Landscape" : "Portrait"}`;
  const descriptionError = selectedTemplate.id.endsWith("fixed") && !donation && fixedDescription.length > 30
    ? `Description is ${fixedDescription.length} characters. Remove ${fixedDescription.length - 30} to fit the 30-character limit (including spaces).`
    : "";
  const previewKey = JSON.stringify([selectedSource.value, selectedTemplate.id, outputSize, donationCause, fixedDescription, fixedPrice, amount, amountMode, merchantCity, merchantName, reference, logo, donation]);
  const latestPreviewKey = useRef(previewKey);
  latestPreviewKey.current = previewKey;
  const assertExportCurrent = () => {
    if (!selectedSource.qr || latestPreviewKey.current !== previewKey) {
      throw new Error("Payment details or flyer settings changed. Generate the QR again if required and retry export.");
    }
  };
  const previewIsCurrent = renderedPreviewKey === previewKey;
  const activePreviewDataUrl = selectedSource.qr && !descriptionError && previewIsCurrent ? previewDataUrl : "";
  const previewPlaceholder = descriptionError || (!selectedSource.qr
    ? "Generate the selected QR source to preview this template."
    : (previewIsCurrent && previewMessage) || "Rendering preview...");

  async function renderCard(input: Parameters<typeof renderPaymentCard>[0] & { qrPayload: string; logo: string }): Promise<string> {
    const dimensions = templateDimensions(input.templateId);
    const output = outputDimensions(input.templateId, input.outputSize ?? "original");
    const scale = Math.min(output.width / dimensions.width, output.height / dimensions.height);
    const qrSize = input.templateId.startsWith("bimpay-landscape") ? 580 : 720;
    const qr = await renderPaymentQr(input.qrPayload, Math.ceil(qrSize * scale), input.logo);
    const { qrPayload: _payload, logo: _logo, ...cardInput } = input;
    return renderPaymentCard({ ...cardInput, qr });
  }

  async function createTemplatePng(source = selectedSource): Promise<string> {
    if (!source.qr) {
      throw new Error("Generate this QR source before exporting a template.");
    }

    const image = await renderCard({
      templateId: selectedTemplate.id,
      qr: source.qr,
      merchantName,
      donationCause,
      fixedDescription,
      fixedPrice,
      outputSize,
      qrPayload: source.value,
      logo,
      isDonation: donation,
    });
    assertExportCurrent();
    return image;
  }

  useEffect(() => {
    let cancelled = false;

    if (!selectedSource.qr) {
      return () => {
        cancelled = true;
      };
    }

    void renderCard({
      templateId: selectedTemplate.id,
      qr: selectedSource.qr,
      merchantName,
      donationCause,
      fixedDescription,
      fixedPrice,
      outputSize,
      qrPayload: selectedSource.value,
      logo,
      isDonation: donation,
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
    logo,
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

      assertExportCurrent();
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
      const bytes = await exportPaymentCardPdf(imageData, {
        templateId: selectedTemplate.id, size: outputSize,
        title: `${selectedTemplate.title} - ${merchantName || "Payment QR"}`,
        creator: "BiMPay QR Utility",
      });
      assertExportCurrent();
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
      title="Print and Share"
    >
      <section aria-labelledby="qr-code-section-title">
        <details open={outputsInitiallyOpen}>
          <summary className="cursor-pointer text-slate-950">
            <h3 id="qr-code-section-title" className="inline text-lg font-bold">QR Code</h3>
          </summary>
          <StandaloneQrOutput payload={selectedSource.value} logo={logo} merchantName={merchantName} onOpen={onOpenStandaloneQr} />
        </details>
      </section>

      <section aria-labelledby="payment-card-section-title" className="mt-8 border-t border-slate-200 pt-6">
        <details open={outputsInitiallyOpen}>
          <summary className="cursor-pointer text-slate-950">
            <h3 id="payment-card-section-title" className="inline text-lg font-bold">QR Payment Card</h3>
          </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Template</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
            value={selectedLayout.portrait}
            disabled={amountMode === "fixed"}
            onChange={(event) => {
              const layout = TEMPLATE_LAYOUTS.find((item) => item.portrait === event.target.value);
              if (layout) onTemplateChange(layout[orientation]);
            }}
          >
            {TEMPLATE_LAYOUTS
              .filter((layout) => {
                if (amountMode === "fixed") {
                  return layout.portrait === "bimpay-fixed";
                }
            
                if (donation) {
                  return layout.portrait === "bimpay-donations";
                }
            
                return (
                  layout.portrait !== "bimpay-fixed" &&
                  layout.portrait !== "bimpay-donations"
                );
              })
              .map((layout) => (
                <option key={layout.portrait} value={layout.portrait}>
                  {layout.label}
                </option>
              ))}
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

      {selectedTemplate.id.endsWith("fixed") && !donation && (
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

      {donation && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Give to / Cause
          </span>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            value={donationCause}
            maxLength={30}
            onChange={(event) =>
              setDonationCause(event.target.value.slice(0, 30))
            }
          />
          <span className="mt-1 block text-xs text-slate-500">
            {donationCause.length}/30
          </span>
        </label>
      )}

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 id="payment-card-preview-title" className="text-sm font-black text-slate-950">Printable QR Payment Card preview</h4>
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
        </details>
      </section>
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
  const latestValue = useRef(value);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  latestValue.current = value;
  const assertCurrent = () => {
    if (!mounted.current || !value || latestValue.current !== value) throw new Error("Payment details changed. Generate the QR again.");
  };

  async function shareQr(): Promise<void> {
    try {
      if (!qr) {
        setShareMessage("Generate the QR code before sharing.");
        return;
      }

      const file = await dataUrlToFile(qr, `${safeFileName(title)}.png`);
      assertCurrent();

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
      if (!mounted.current || !value || latestValue.current !== value) {
        setShareMessage("Payment details changed. Generate the QR again.");
        return;
      }
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

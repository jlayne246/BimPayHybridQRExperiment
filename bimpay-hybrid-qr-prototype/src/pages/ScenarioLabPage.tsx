import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ACCOUNT_PROFILES, MERCHANTS, PEOPLE } from "../data/sampleProfiles";
import type {
  AccountProfile,
  MerchantProfile,
  PersonProfile,
} from "../data/sampleProfiles";
import {
  buildSandboxEmvPayload,
  isValidSandboxAmount,
  validateSandboxPaymentRequest,
  validateSandboxPayloadCrc,
} from "../lib/sandboxEmv";
import type { SandboxPaymentRequest } from "../lib/sandboxEmv";
import { ExperimentalWarning } from "../components/ExperimentalWarning";
import { MERCHANT_CATEGORY_OPTIONS } from "../data/merchantCategories";
import { readJsonOrError, readJsonResponse } from "../lib/http";

type ScenarioMode = "interpersonal" | "merchant";
type MerchantSource = "preset" | "custom";
type AmountMode = "fixed" | "variable";
type RequestState =
  | "ready"
  | "created"
  | "scanned"
  | "authorized"
  | "declined"
  | "expired"
  | "cancelled"
  | "refunded";
type TestRoute = "TESTROC1" | "TESTROC2";

interface CustomMerchantFields {
  name: string;
  location: string;
  merchantCategoryCode: string;
  accountReference: string;
  route: TestRoute;
}

interface CustomPersonFields {
  name: string;
  accountReference: string;
  route: TestRoute;
}

interface SimulatedTransaction {
  id: string;
  mode: ScenarioMode;
  payer: string;
  recipient: string;
  amount: string;
  reference: string;
  status: Exclude<RequestState, "ready" | "created" | "scanned">;
  createdAt: string;
  updatedAt: string;
  receiptNumber: string;
}

interface PaymentLinkRecord {
  token: string;
  emvPayload: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  status: Exclude<RequestState, "ready">;
  payerName: string;
  recipientName: string;
  reference: string;
  requestedAmount: string;
  amountMode: AmountMode;
  authorizedAmount: string;
  events: Array<{
    status: Exclude<RequestState, "ready">;
    actor: string;
    timestamp: string;
  }>;
}

type RecipientProfile = AccountProfile | MerchantProfile;

const CUSTOM_PEOPLE_STORAGE_KEY = "bimpay-sandbox-custom-people";
const CUSTOM_MERCHANTS_STORAGE_KEY = "bimpay-sandbox-custom-merchants";

const TEST_ROUTES: Record<
  TestRoute,
  Pick<
    MerchantProfile,
    "financialInstitution" | "financialInstitutionAlias" | "branchAlias" | "participantCode"
  >
> = {
  TESTROC1: {
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
  },
  TESTROC2: {
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
  },
};

export default function ScenarioLabPage() {
  const [mode, setMode] = useState<ScenarioMode>("interpersonal");
  const [merchantSource, setMerchantSource] = useState<MerchantSource>("preset");
  const [payerId, setPayerId] = useState(PEOPLE[0].id);
  const [personRecipientId, setPersonRecipientId] = useState(PEOPLE[1].id);
  const [merchantId, setMerchantId] = useState(MERCHANTS[0].id);
  const [customMerchant, setCustomMerchant] = useState<CustomMerchantFields>({
    name: "Test Custom Merchant",
    location: "Bridgetown",
    merchantCategoryCode: "0000",
    accountReference: "299999999999999",
    route: "TESTROC1",
  });
  const [customPerson, setCustomPerson] = useState<CustomPersonFields>({
    name: "",
    accountReference: "",
    route: "TESTROC1",
  });
  const [customPeople, setCustomPeople] = useState<PersonProfile[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_PEOPLE_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as PersonProfile[]) : [];
    } catch {
      return [];
    }
  });
  const [customMerchants, setCustomMerchants] = useState<MerchantProfile[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_MERCHANTS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as MerchantProfile[]) : [];
    } catch {
      return [];
    }
  });
  const [savedMerchantId, setSavedMerchantId] = useState("");
  const [merchantMessage, setMerchantMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("fixed");
  const [amount, setAmount] = useState("12.50");
  const [payerEnteredAmount, setPayerEnteredAmount] = useState("");
  const [reference, setReference] = useState("Lunch split");
  const [requestState, setRequestState] = useState<RequestState>("ready");
  const [requestCreatedAt, setRequestCreatedAt] = useState("");
  const [sharedToken, setSharedToken] = useState("");
  const [sharedSession, setSharedSession] = useState<PaymentLinkRecord | null>(null);
  const [qr, setQr] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [payload, setPayload] = useState("");
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState<SimulatedTransaction[]>([]);

  const accountProfiles = useMemo(
    () => [...ACCOUNT_PROFILES, ...customPeople],
    [customPeople]
  );
  const payer =
    accountProfiles.find((profile) => profile.id === payerId) ?? ACCOUNT_PROFILES[0];
  const recipient = useMemo<RecipientProfile>(() => {
    if (mode === "merchant" && merchantSource === "preset") {
      return MERCHANTS.find((profile) => profile.id === merchantId) ?? MERCHANTS[0];
    }

    if (mode === "merchant" && merchantSource === "custom") {
      const route = TEST_ROUTES[customMerchant.route];
      const initials =
        customMerchant.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() || "CM";

      return {
        id: "custom-merchant",
        kind: "merchant",
        name: customMerchant.name.trim() || "Test Custom Merchant",
        initials,
        color: "bg-fuchsia-600",
        category:
          MERCHANT_CATEGORY_OPTIONS.find(
            (option) => option.value === customMerchant.merchantCategoryCode
          )?.label ?? "Custom merchant",
        merchantCategoryCode: customMerchant.merchantCategoryCode,
        location: customMerchant.location.trim() || "Bridgetown",
        accountReference: customMerchant.accountReference,
        ...route,
      };
    }

    return (
      accountProfiles.find((profile) => profile.id === personRecipientId) ??
      ACCOUNT_PROFILES[1]
    );
  }, [
    accountProfiles,
    customMerchant,
    merchantId,
    merchantSource,
    mode,
    personRecipientId,
  ]);
  const request = useMemo<SandboxPaymentRequest>(
    () => ({
      recipientName: recipient.name,
      city: recipient.kind === "merchant" ? recipient.location : "Bridgetown",
      accountReference: recipient.accountReference,
      participantCode: recipient.participantCode,
      financialInstitutionAlias: recipient.financialInstitutionAlias,
      branchAlias: recipient.branchAlias,
      merchantCategoryCode:
        recipient.kind === "merchant" ? recipient.merchantCategoryCode : "0000",
      amount,
      amountMode: mode === "interpersonal" ? "fixed" : amountMode,
      reference,
    }),
    [amount, amountMode, mode, recipient, reference]
  );
  const validationChecks = useMemo(
    () => validateSandboxPaymentRequest(request),
    [request]
  );
  const hasValidationErrors =
    validationChecks.some((check) => check.status === "error") ||
    (mode === "interpersonal" && payer.id === recipient.id);

  useEffect(() => {
    localStorage.setItem(CUSTOM_PEOPLE_STORAGE_KEY, JSON.stringify(customPeople));
  }, [customPeople]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_MERCHANTS_STORAGE_KEY, JSON.stringify(customMerchants));
  }, [customMerchants]);

  useEffect(() => {
    if (!sharedToken) return;

    const interval = window.setInterval(() => {
      void fetch(`/api/payment-links?t=${encodeURIComponent(sharedToken)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
        .then((response) => readJsonOrError<PaymentLinkRecord>(response))
        .then((record) => syncSharedSession(record))
        .catch(() => {
          setMessage("Shared session could not be refreshed. It may have expired.");
        });
    }, 2000);

    return () => window.clearInterval(interval);
  }, [sharedToken]);

  function switchMode(nextMode: ScenarioMode): void {
    setMode(nextMode);
    setAmountMode("fixed");
    setAmount(nextMode === "interpersonal" ? "12.50" : "18.75");
    setPayerEnteredAmount("");
    setReference(
      nextMode === "interpersonal"
        ? "Lunch split"
        : merchantSource === "custom"
          ? "Custom checkout 001"
          : "Counter order 104"
    );
    clearGeneratedRequest();
  }

  function switchMerchantSource(nextSource: MerchantSource): void {
    setMerchantSource(nextSource);
    setReference(nextSource === "custom" ? "Custom checkout 001" : "Counter order 104");
    clearGeneratedRequest();
  }

  function updateCustomMerchant<K extends keyof CustomMerchantFields>(
    key: K,
    value: CustomMerchantFields[K]
  ): void {
    setCustomMerchant((current) => ({ ...current, [key]: value }));
    clearGeneratedRequest();
  }

  function saveCustomMerchant(): void {
    const checks = validateSandboxPaymentRequest(request).filter((check) =>
      ["route", "account", "name", "city", "mcc", "protocol"].includes(check.id)
    );
    if (checks.some((check) => check.status === "error")) {
      setMerchantMessage("Resolve the validation errors before saving this merchant.");
      return;
    }

    const route = TEST_ROUTES[customMerchant.route];
    const normalizedName = customMerchant.name.trim();
    const initials =
      normalizedName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "CM";
    const existingId = savedMerchantId || `custom-merchant-${crypto.randomUUID()}`;
    const profile: MerchantProfile = {
      id: existingId,
      kind: "merchant",
      name: normalizedName,
      initials,
      color: "bg-fuchsia-600",
      category:
        MERCHANT_CATEGORY_OPTIONS.find(
          (option) => option.value === customMerchant.merchantCategoryCode
        )?.label ?? "Custom merchant",
      merchantCategoryCode: customMerchant.merchantCategoryCode,
      location: customMerchant.location.trim(),
      accountReference: customMerchant.accountReference,
      ...route,
    };

    setCustomMerchants((current) => [
      ...current.filter((merchant) => merchant.id !== existingId),
      profile,
    ]);
    setSavedMerchantId(existingId);
    setMerchantMessage(`${profile.name} was saved in this browser.`);
  }

  function loadCustomMerchant(profileId: string): void {
    setSavedMerchantId(profileId);
    const profile = customMerchants.find((merchant) => merchant.id === profileId);
    if (!profile) return;

    setCustomMerchant({
      name: profile.name,
      location: profile.location,
      merchantCategoryCode: profile.merchantCategoryCode,
      accountReference: profile.accountReference,
      route: profile.financialInstitutionAlias as TestRoute,
    });
    setMerchantMessage(`${profile.name} loaded for editing and checkout.`);
    clearGeneratedRequest();
  }

  function removeCustomMerchant(profileId: string): void {
    setCustomMerchants((current) => current.filter((merchant) => merchant.id !== profileId));
    if (savedMerchantId === profileId) setSavedMerchantId("");
    setMerchantMessage("Saved custom merchant removed.");
  }

  function updateCustomPerson<K extends keyof CustomPersonFields>(
    key: K,
    value: CustomPersonFields[K]
  ): void {
    setCustomPerson((current) => ({ ...current, [key]: value }));
    setProfileMessage("");
  }

  function addCustomPerson(): void {
    const normalizedName = customPerson.name.trim();

    if (!normalizedName) {
      setProfileMessage("Enter a display name for the sandbox profile.");
      return;
    }

    if (!/^\d{6,24}$/.test(customPerson.accountReference)) {
      setProfileMessage("The synthetic account reference must contain 6-24 digits.");
      return;
    }

    const route = TEST_ROUTES[customPerson.route];
    const initials =
      normalizedName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "CP";
    const profile: PersonProfile = {
      id: `custom-person-${crypto.randomUUID()}`,
      kind: "person",
      name: normalizedName,
      initials,
      color: "bg-teal-600",
      accountReference: customPerson.accountReference,
      ...route,
    };

    setCustomPeople((current) => [...current, profile]);
    setCustomPerson({
      name: "",
      accountReference: "",
      route: customPerson.route,
    });
    setProfileMessage(`${normalizedName} is now available in the payer and recipient lists.`);
  }

  function removeCustomPerson(profileId: string): void {
    setCustomPeople((current) => current.filter((profile) => profile.id !== profileId));

    if (payerId === profileId) {
      setPayerId(PEOPLE[0].id);
    }

    if (personRecipientId === profileId) {
      setPersonRecipientId(PEOPLE[1].id);
    }

    clearGeneratedRequest();
  }

  function clearGeneratedRequest(): void {
    setRequestState("ready");
    setRequestCreatedAt("");
    setPayerEnteredAmount("");
    setSharedToken("");
    setSharedSession(null);
    setQr("");
    setPaymentLink("");
    setPayload("");
    setMessage("");
  }

  async function generateRequest(): Promise<void> {
    if (mode === "interpersonal" && payer.id === recipient.id) {
      setMessage("Choose two different account profiles for this transfer.");
      return;
    }

    if (hasValidationErrors) {
      setMessage("Resolve the validation errors before generating this QR request.");
      return;
    }

    const emvPayload = buildSandboxEmvPayload(request);

    let link = `${window.location.origin}/pay?emv=${encodeURIComponent(emvPayload)}`;

    try {
      const response = await fetch("/api/payment-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emvPayload,
            payerName: payer.name,
            recipientName: recipient.name,
            reference,
            requestedAmount: amountMode === "variable" ? "" : amount,
            amountMode: mode === "interpersonal" ? "fixed" : amountMode,
          }),
      });

      if (response.ok) {
        const record = await readJsonResponse<PaymentLinkRecord>(response);
        link = `${window.location.origin}/pay?t=${record.token}&emv=${encodeURIComponent(emvPayload)}`;
        setSharedToken(record.token);
        setSharedSession(record);
      }
    } catch {
      // The embedded payload link remains usable when the token service is offline.
    }

    const qrDataUrl = await QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 420,
    });

    setPayload(emvPayload);
    setPaymentLink(link);
    setQr(qrDataUrl);
    setRequestCreatedAt(new Date().toISOString());
    setRequestState("created");
    setMessage("Payment request created. Mark it scanned to continue the lifecycle.");
  }

  function syncSharedSession(record: PaymentLinkRecord): void {
    setSharedSession(record);
    setRequestState(record.status);
    setRequestCreatedAt(record.createdAt);

    if (["authorized", "declined", "expired", "cancelled", "refunded"].includes(record.status)) {
      const transaction: SimulatedTransaction = {
        id: `shared-${record.token}`,
        mode,
        payer: record.payerName || payer.name,
        recipient: record.recipientName || recipient.name,
        amount: record.authorizedAmount || record.requestedAmount || "0.00",
        reference: record.reference || reference,
        status: record.status as SimulatedTransaction["status"],
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        receiptNumber: `SBX-${record.token.toUpperCase()}`,
      };
      setTransactions((current) => [
        transaction,
        ...current.filter((item) => item.id !== transaction.id),
      ]);
    }
  }

  async function transitionRequest(nextState: RequestState): Promise<void> {
    if (
      nextState === "authorized" &&
      amountMode === "variable" &&
      !isValidSandboxAmount(payerEnteredAmount)
    ) {
      setMessage("Enter the payer-authorized amount with two decimal places.");
      return;
    }

    const now = new Date().toISOString();
    const finalAmount =
      amountMode === "variable" && mode !== "interpersonal" ? payerEnteredAmount : amount;

    if (sharedToken && nextState !== "ready") {
      try {
        const response = await fetch(
          `/api/payment-links?t=${encodeURIComponent(sharedToken)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: nextState,
              actor: payer.name,
              authorizedAmount: finalAmount,
            }),
          }
        );
        syncSharedSession(await readJsonOrError<PaymentLinkRecord>(response));
        setMessage(`Shared transaction session moved to ${nextState}.`);
        return;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update shared session.");
        return;
      }
    }

    if (["authorized", "declined", "expired", "cancelled"].includes(nextState)) {
      const transaction: SimulatedTransaction = {
        id: crypto.randomUUID(),
        mode,
        payer: payer.name,
        recipient: recipient.name,
        amount: finalAmount || "0.00",
        reference,
        status: nextState as SimulatedTransaction["status"],
        createdAt: requestCreatedAt || now,
        updatedAt: now,
        receiptNumber: `SBX-${now.replace(/\D/g, "").slice(2, 14)}`,
      };
      setTransactions((current) => [transaction, ...current]);
    }

    if (nextState === "refunded") {
      setTransactions((current) => {
        const [latest, ...rest] = current;
        return latest
          ? [{ ...latest, status: "refunded", updatedAt: now }, ...rest]
          : current;
      });
    }

    setRequestState(nextState);
    setMessage(`Request moved to ${nextState}. No funds or external accounts were affected.`);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-800 via-indigo-700 to-violet-700 p-7 text-white shadow-xl sm:p-10">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">
            Profile scenario lab
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
            Model payments between people, organizations, and businesses
          </h1>
          <p className="mt-4 text-sm leading-6 text-blue-100 sm:text-base">
            Generate situational QR requests from a shared fictional profile catalog, including
            individuals, businesses, charities, and churches.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <ExperimentalWarning />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <ModeButton
                active={mode === "interpersonal"}
                label="Account transfer"
                onClick={() => switchMode("interpersonal")}
              />
              <ModeButton
                active={mode === "merchant"}
                label="Merchant checkout"
                onClick={() => switchMode("merchant")}
              />
            </div>

            <div className="mt-6 space-y-5">
              <ProfileSelect
                label="Payer"
                profiles={accountProfiles}
                value={payerId}
                onChange={(value) => {
                  setPayerId(value);
                  clearGeneratedRequest();
                }}
              />

              {mode === "interpersonal" ? (
                <ProfileSelect
                  label="Recipient"
                  profiles={accountProfiles}
                  value={personRecipientId}
                  onChange={(value) => {
                    setPersonRecipientId(value);
                    clearGeneratedRequest();
                  }}
                />
              ) : (
                <div className="space-y-5">
                  <div>
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Merchant source
                    </span>
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                      <ModeButton
                        active={merchantSource === "preset"}
                        label="Preset merchant"
                        onClick={() => switchMerchantSource("preset")}
                      />
                      <ModeButton
                        active={merchantSource === "custom"}
                        label="Custom merchant"
                        onClick={() => switchMerchantSource("custom")}
                      />
                    </div>
                  </div>

                  {merchantSource === "preset" ? (
                    <ProfileSelect
                      label="Merchant"
                      profiles={MERCHANTS}
                      value={merchantId}
                      onChange={(value) => {
                        setMerchantId(value);
                        clearGeneratedRequest();
                      }}
                    />
                  ) : (
                    <CustomMerchantEditor
                      fields={customMerchant}
                      message={merchantMessage}
                      profiles={customMerchants}
                      selectedProfileId={savedMerchantId}
                      onLoad={loadCustomMerchant}
                      onRemove={removeCustomMerchant}
                      onSave={saveCustomMerchant}
                      onChange={updateCustomMerchant}
                    />
                  )}
                </div>
              )}

              {mode !== "interpersonal" && (
                <div>
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Merchant amount mode
                  </span>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                    <ModeButton
                      active={amountMode === "fixed"}
                      label="Fixed amount"
                      onClick={() => {
                        setAmountMode("fixed");
                        clearGeneratedRequest();
                      }}
                    />
                    <ModeButton
                      active={amountMode === "variable"}
                      label="Payer enters amount"
                      onClick={() => {
                        setAmountMode("variable");
                        clearGeneratedRequest();
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-sm font-bold text-slate-700">Amount (BBD)</span>
                  <input
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={mode !== "interpersonal" && amountMode === "variable"}
                    inputMode="decimal"
                    value={mode !== "interpersonal" && amountMode === "variable" ? "***" : amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      clearGeneratedRequest();
                    }}
                  />
                  {mode !== "interpersonal" && amountMode === "variable" && (
                    <span className="mt-1 block text-xs text-slate-500">
                      Tag 54 will contain ***. The payer enters the amount after scanning.
                    </span>
                  )}
                </label>
                <label>
                  <span className="mb-2 block text-sm font-bold text-slate-700">Situation / reference</span>
                  <input
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    value={reference}
                    onChange={(event) => {
                      setReference(event.target.value);
                      clearGeneratedRequest();
                    }}
                  />
                </label>
              </div>

              <ValidationPanel
                checks={validationChecks}
                samePerson={mode === "interpersonal" && payer.id === recipient.id}
              />

              <button
                className="w-full rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={hasValidationErrors}
                type="button"
                onClick={() => void generateRequest()}
              >
                Generate situational QR request
              </button>

              {message && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
                  {message}
                </div>
              )}

              {sharedSession && (
                <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-indigo-950">Live shared session</div>
                      <div className="mt-1 text-xs text-indigo-700">
                        Token <span className="font-mono">{sharedSession.token}</span> · expires{" "}
                        {new Date(sharedSession.expiresAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <StatusBadge state={sharedSession.status} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-indigo-800">
                    Another signed-in browser can scan this QR in the Scanner section or open its
                    payment link. Updates are checked every two seconds.
                  </p>
                  <div className="mt-4 space-y-2">
                    {sharedSession.events.slice(-3).reverse().map((event, index) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs"
                        key={`${event.timestamp}-${event.status}-${index}`}
                      >
                        <span className="font-bold text-slate-800">
                          {event.status} by {event.actor}
                        </span>
                        <span className="text-slate-500">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <CustomPeopleManager
            fields={customPerson}
            profiles={customPeople}
            message={profileMessage}
            onAdd={addCustomPerson}
            onChange={updateCustomPerson}
            onRemove={removeCustomPerson}
          />

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Simulated transaction history</h2>
            <p className="mt-1 text-sm text-slate-600">Current browser session only.</p>
            <div className="mt-5 space-y-3">
              {transactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Completed simulations will appear here.
                </div>
              ) : (
                transactions.map((transaction) => (
                  <div
                    className="rounded-2xl border border-slate-200 p-4"
                    key={transaction.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-slate-950">
                          {transaction.payer} to {transaction.recipient}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {transaction.reference} ·{" "}
                          {new Date(transaction.updatedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-950">${transaction.amount}</div>
                        <div className="mt-1 text-xs font-black uppercase text-slate-500">
                          {transaction.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Payment request preview</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {mode === "interpersonal"
                    ? "Interpersonal payment request"
                    : merchantSource === "custom"
                      ? "Custom merchant-presented checkout"
                      : "Preset merchant-presented checkout"}
                </p>
              </div>
              <StatusBadge state={requestState} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <ProfileCard profile={payer} role="Pays" />
              <div className="text-center text-2xl font-black text-slate-300">→</div>
              <ProfileCard profile={recipient} role="Receives" />
            </div>

            <div className="mt-5 rounded-3xl bg-slate-950 p-6 text-white">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Requested amount
              </div>
              <div className="mt-2 text-4xl font-black">
                {mode !== "interpersonal" && amountMode === "variable"
                  ? "Payer-entered BBD"
                  : `$${amount || "0.00"} BBD`}
              </div>
              <div className="mt-2 text-sm text-slate-300">{reference || "No reference"}</div>
            </div>

            {qr ? (
              <div className="mt-6">
                <div className="flex justify-center">
                  <img
                    alt="Situational payment request QR code"
                    className="h-72 w-72 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"
                    src={qr}
                  />
                </div>
                <div className="mt-4 rounded-2xl bg-slate-100 p-3 font-mono text-[11px] leading-5 text-slate-700 break-all">
                  {paymentLink}
                </div>
                <LifecycleControls
                  amountMode={mode === "interpersonal" ? "fixed" : amountMode}
                  payerEnteredAmount={payerEnteredAmount}
                  payerName={payer.name}
                  state={requestState}
                  onAmountChange={setPayerEnteredAmount}
                  onTransition={transitionRequest}
                />
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                Configure the situation and generate a QR request.
              </div>
            )}
          </div>

          {payload && (
            <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <summary className="cursor-pointer font-black text-slate-950">
                Inspect generated EMV payload
              </summary>
              <div className="mt-4 rounded-2xl bg-slate-100 p-4 font-mono text-xs leading-5 text-slate-700 break-all">
                {payload}
              </div>
              <div className="mt-3 text-sm font-bold text-emerald-700">
                CRC {validateSandboxPayloadCrc(payload) ? "valid" : "invalid"}
              </div>
            </details>
          )}

          {(requestState === "authorized" || requestState === "refunded") &&
            transactions[0] && <ReceiptCard transaction={transactions[0]} />}
        </section>
      </div>
    </main>
  );
}

function ValidationPanel({
  checks,
  samePerson,
}: {
  checks: ReturnType<typeof validateSandboxPaymentRequest>;
  samePerson: boolean;
}) {
  const allChecks = samePerson
    ? [
        {
          id: "people",
          label: "Distinct participants",
          detail: "Choose different payer and recipient profiles.",
          status: "error" as const,
        },
        ...checks,
      ]
    : checks;
  const errorCount = allChecks.filter((check) => check.status === "error").length;
  const warningCount = allChecks.filter((check) => check.status === "warning").length;

  return (
    <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4" open>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-black text-slate-950">Pre-generation validation</div>
            <div className="mt-1 text-xs text-slate-500">
              {errorCount
                ? `${errorCount} error(s) must be resolved`
                : warningCount
                  ? `${warningCount} warning(s); generation is allowed`
                  : "All sandbox checks pass"}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
              errorCount
                ? "bg-red-100 text-red-800"
                : warningCount
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {errorCount ? "Blocked" : "Ready"}
          </span>
        </div>
      </summary>
      <div className="mt-4 grid gap-2">
        {allChecks.map((check) => (
          <div
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
            key={check.id}
          >
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
                check.status === "pass"
                  ? "bg-emerald-500"
                  : check.status === "warning"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
            />
            <div>
              <div className="text-sm font-bold text-slate-900">{check.label}</div>
              <div className="mt-0.5 text-xs leading-5 text-slate-500">{check.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function LifecycleControls({
  state,
  amountMode,
  payerEnteredAmount,
  payerName,
  onAmountChange,
  onTransition,
}: {
  state: RequestState;
  amountMode: AmountMode;
  payerEnteredAmount: string;
  payerName: string;
  onAmountChange: (value: string) => void;
  onTransition: (state: RequestState) => void;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-black text-slate-950">Request lifecycle</div>
          <div className="mt-1 text-xs text-slate-500">
            Advance or terminate this local simulation.
          </div>
        </div>
        <StatusBadge state={state} />
      </div>

      {state === "created" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <LifecycleButton label="Mark scanned" tone="primary" onClick={() => onTransition("scanned")} />
          <LifecycleButton label="Cancel" tone="danger" onClick={() => onTransition("cancelled")} />
          <LifecycleButton label="Expire" tone="neutral" onClick={() => onTransition("expired")} />
        </div>
      )}

      {state === "scanned" && (
        <div className="mt-4">
          {amountMode === "variable" && (
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Amount entered by {payerName} (BBD)
              </span>
              <input
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                inputMode="decimal"
                placeholder="18.75"
                value={payerEnteredAmount}
                onChange={(event) => onAmountChange(event.target.value)}
              />
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <LifecycleButton
              label={`Authorize as ${payerName}`}
              tone="success"
              onClick={() => onTransition("authorized")}
            />
            <LifecycleButton label="Decline" tone="danger" onClick={() => onTransition("declined")} />
            <LifecycleButton label="Cancel" tone="danger" onClick={() => onTransition("cancelled")} />
            <LifecycleButton label="Expire" tone="neutral" onClick={() => onTransition("expired")} />
          </div>
        </div>
      )}

      {state === "authorized" && (
        <div className="mt-4">
          <LifecycleButton label="Simulate refund" tone="neutral" onClick={() => onTransition("refunded")} />
        </div>
      )}

      {["declined", "expired", "cancelled", "refunded"].includes(state) && (
        <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-600">
          This request reached a terminal sandbox state. Generate another QR to start a new request.
        </div>
      )}
    </div>
  );
}

function LifecycleButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "primary" | "success" | "danger" | "neutral";
  onClick: () => void;
}) {
  const classes = {
    primary: "bg-blue-700 text-white hover:bg-blue-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    danger: "bg-red-600 text-white hover:bg-red-500",
    neutral: "bg-slate-700 text-white hover:bg-slate-600",
  };

  return (
    <button
      className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition ${classes[tone]}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ReceiptCard({ transaction }: { transaction: SimulatedTransaction }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <div className="bg-emerald-700 p-6 text-white">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">
          Sandbox receipt
        </div>
        <div className="mt-2 text-3xl font-black">${transaction.amount} BBD</div>
        <div className="mt-1 text-sm text-emerald-100">{transaction.status}</div>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <ReceiptValue label="Receipt number" value={transaction.receiptNumber} mono />
        <ReceiptValue label="Updated" value={new Date(transaction.updatedAt).toLocaleString()} />
        <ReceiptValue label="Payer" value={transaction.payer} />
        <ReceiptValue label="Recipient" value={transaction.recipient} />
        <ReceiptValue label="Reference" value={transaction.reference} />
        <ReceiptValue label="Scenario" value={transaction.mode} />
      </div>
      <div className="border-t border-emerald-100 bg-emerald-50 px-6 py-4 text-xs font-semibold text-emerald-900">
        Simulation only. This receipt does not represent a transfer of funds.
      </div>
    </section>
  );
}

function ReceiptValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-xl px-4 py-3 text-sm font-black transition ${
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CustomPeopleManager({
  fields,
  profiles,
  message,
  onAdd,
  onChange,
  onRemove,
}: {
  fields: CustomPersonFields;
  profiles: PersonProfile[];
  message: string;
  onAdd: () => void;
  onChange: <K extends keyof CustomPersonFields>(
    key: K,
    value: CustomPersonFields[K]
  ) => void;
  onRemove: (profileId: string) => void;
}) {
  const route = TEST_ROUTES[fields.route];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-black text-slate-950">Custom sandbox people</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Create fictional payer or recipient profiles stored only in this browser. Do not use real
          account identifiers.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ScenarioField
          label="Display name"
          value={fields.name}
          onChange={(value) => onChange("name", value)}
          helper="Used in the scenario preview and transaction history."
        />
        <ScenarioField
          label="Synthetic account reference"
          value={fields.accountReference}
          onChange={(value) => onChange("accountReference", value)}
          helper="Required: 6-24 digits."
        />
        <label className="sm:col-span-2">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            BiMPay test route
          </span>
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            value={fields.route}
            onChange={(event) => onChange("route", event.target.value as TestRoute)}
          >
            <option value="TESTROC1">Test Route 1 - 333331</option>
            <option value="TESTROC2">Test Route 2 - 333332</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-3">
        <RouteValue label="FI alias" value={route.financialInstitutionAlias} />
        <RouteValue label="Branch alias" value={route.branchAlias} />
        <RouteValue label="Participant" value={route.participantCode} />
      </div>

      <button
        className="mt-4 w-full rounded-2xl bg-teal-700 px-5 py-3 text-sm font-black text-white transition hover:bg-teal-600"
        type="button"
        onClick={onAdd}
      >
        Add sandbox person
      </button>

      {message && (
        <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          {message}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          {profiles.map((profile) => (
            <div
              className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"
              key={profile.id}
            >
              <Avatar profile={profile} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-slate-950">{profile.name}</div>
                <div className="truncate text-xs text-slate-500">
                  {profile.financialInstitutionAlias} · {profile.participantCode} ·{" "}
                  {profile.accountReference}
                </div>
              </div>
              <button
                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
                type="button"
                onClick={() => onRemove(profile.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomMerchantEditor({
  fields,
  profiles,
  selectedProfileId,
  message,
  onLoad,
  onRemove,
  onSave,
  onChange,
}: {
  fields: CustomMerchantFields;
  profiles: MerchantProfile[];
  selectedProfileId: string;
  message: string;
  onLoad: (profileId: string) => void;
  onRemove: (profileId: string) => void;
  onSave: () => void;
  onChange: <K extends keyof CustomMerchantFields>(
    key: K,
    value: CustomMerchantFields[K]
  ) => void;
}) {
  const route = TEST_ROUTES[fields.route];

  return (
    <div className="rounded-3xl border border-fuchsia-200 bg-fuchsia-50/50 p-5">
      <div>
        <h2 className="font-black text-slate-950">Custom merchant identity</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Use synthetic merchant information only. Names and locations are normalized to EMV field
          limits when the payload is generated.
        </p>
      </div>

      {profiles.length > 0 && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            Saved custom merchant
          </span>
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-fuchsia-600 focus:ring-4 focus:ring-fuchsia-100"
            value={selectedProfileId}
            onChange={(event) => onLoad(event.target.value)}
          >
            <option value="">Select a saved merchant</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} - {profile.financialInstitutionAlias}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ScenarioField
          label="Merchant name"
          value={fields.name}
          onChange={(value) => onChange("name", value)}
          helper="Up to 25 characters are included in tag 59."
        />
        <ScenarioField
          label="Merchant location"
          value={fields.location}
          onChange={(value) => onChange("location", value)}
          helper="Up to 15 characters are included in tag 60."
        />
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-700">
            Merchant category
          </span>
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-fuchsia-600 focus:ring-4 focus:ring-fuchsia-100"
            value={fields.merchantCategoryCode}
            onChange={(event) => onChange("merchantCategoryCode", event.target.value)}
          >
            {MERCHANT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-700">
            BiMPay test route
          </span>
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-fuchsia-600 focus:ring-4 focus:ring-fuchsia-100"
            value={fields.route}
            onChange={(event) => onChange("route", event.target.value as TestRoute)}
          >
            <option value="TESTROC1">Test Route 1 - 333331</option>
            <option value="TESTROC2">Test Route 2 - 333332</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <ScenarioField
            label="Synthetic merchant account reference"
            value={fields.accountReference}
            onChange={(value) => onChange("accountReference", value)}
            helper="Required: 6-24 digits. Never enter a real account or merchant identifier."
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-fuchsia-200 bg-white p-4 text-xs sm:grid-cols-3">
        <RouteValue label="FI alias" value={route.financialInstitutionAlias} />
        <RouteValue label="Branch alias" value={route.branchAlias} />
        <RouteValue label="Participant" value={route.participantCode} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          className="rounded-2xl bg-fuchsia-700 px-4 py-3 text-sm font-black text-white transition hover:bg-fuchsia-600"
          type="button"
          onClick={onSave}
        >
          {selectedProfileId ? "Update saved merchant" : "Save custom merchant"}
        </button>
        <button
          className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedProfileId}
          type="button"
          onClick={() => onRemove(selectedProfileId)}
        >
          Remove saved merchant
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-2xl border border-fuchsia-200 bg-white p-3 text-sm font-semibold text-fuchsia-900">
          {message}
        </div>
      )}
    </div>
  );
}

function ScenarioField({
  label,
  value,
  helper,
  onChange,
}: {
  label: string;
  value: string;
  helper?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-fuchsia-600 focus:ring-4 focus:ring-fuchsia-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper && <span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span>}
    </label>
  );
}

function RouteValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 font-mono font-black text-slate-800">{value}</div>
    </div>
  );
}

function ProfileSelect<T extends RecipientProfile>({
  label,
  profiles,
  value,
  onChange,
}: {
  label: string;
  profiles: T[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = profiles.find((profile) => profile.id === value) ?? profiles[0];

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-300 p-3">
        <Avatar profile={selected} />
        <select
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-950 outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} · {profile.kind} · {profile.financialInstitution}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function ProfileCard({ profile, role }: { profile: RecipientProfile; role: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
      <div className="flex justify-center">
        <Avatar profile={profile} />
      </div>
      <div className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">{role}</div>
      <div className="mt-1 font-black text-slate-950">{profile.name}</div>
      <div className="mt-1 text-xs text-slate-500">{profile.financialInstitution}</div>
    </div>
  );
}

function Avatar({ profile }: { profile: RecipientProfile }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${profile.color} text-sm font-black text-white`}
    >
      {profile.initials}
    </div>
  );
}

function StatusBadge({ state }: { state: RequestState }) {
  const classes = {
    ready: "bg-slate-100 text-slate-600",
    created: "bg-blue-100 text-blue-800",
    scanned: "bg-amber-100 text-amber-800",
    authorized: "bg-emerald-100 text-emerald-800",
    declined: "bg-red-100 text-red-800",
    expired: "bg-slate-200 text-slate-700",
    cancelled: "bg-orange-100 text-orange-800",
    refunded: "bg-violet-100 text-violet-800",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${classes[state]}`}>
      {state}
    </span>
  );
}

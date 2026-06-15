import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { ExperimentalWarning } from "../components/ExperimentalWarning";
import { WalletCollaborationPanel } from "../components/WalletCollaborationPanel";
import { CATALOG_PROFILES, MERCHANTS, PEOPLE } from "../data/sampleProfiles";
import {
  adjustSharedBalance,
  loadSharedWalletState,
  paySharedMerchant,
  reloadSharedWallet,
  transferSharedWallets,
} from "../lib/walletCloud";
import { buildSandboxEmvPayload } from "../lib/sandboxEmv";
import type { SharedWorkspaceSession } from "../lib/walletCloud";
import type {
  BalanceType,
  FundingModel,
  LedgerEntry,
  ProfileKind,
  SimulatedWallet,
  WalletFundingSource,
  WalletLabState,
} from "../types/wallet";

type WalletAction = "reload" | "merchant" | "transfer" | "request" | "adjust";
type StaticQrFormat = "link" | "emv";

interface WalletPaymentRequest {
  id: string;
  requesterId: string;
  payerId: string;
  amount: number;
  note: string;
  createdAt: string;
  status: "pending" | "paid";
}

interface WalletProfileFields {
  ownerName: string;
  profileKind: ProfileKind;
  model: FundingModel;
  walletBalance: string;
  bankBalance: string;
  bankName: string;
  bankDetail: string;
  walletIdentifier: string;
  color: string;
}

const WALLET_STORAGE_KEY = "bimpay-sandbox-wallet-models-v2";
const DEFAULT_PROFILE_FIELDS: WalletProfileFields = {
  ownerName: "",
  profileKind: "person",
  model: "prepaid",
  walletBalance: "100.00",
  bankBalance: "500.00",
  bankName: "Test Community Bank",
  bankDetail: "Checking ending 0000",
  walletIdentifier: "",
  color: "from-emerald-700 to-teal-600",
};

const PROFILE_COLORS = [
  { value: "from-emerald-700 to-teal-600", label: "Emerald" },
  { value: "from-blue-700 to-indigo-600", label: "Blue" },
  { value: "from-violet-700 to-fuchsia-600", label: "Violet" },
  { value: "from-amber-600 to-orange-600", label: "Amber" },
  { value: "from-rose-700 to-pink-600", label: "Rose" },
];

const PROFILE_KIND_DETAILS: Record<ProfileKind, { label: string; description: string }> = {
  person: {
    label: "Individual",
    description: "A fictional personal wallet holder.",
  },
  charity: {
    label: "Charity",
    description: "A fictional nonprofit receiving donations and making program payments.",
  },
  church: {
    label: "Church",
    description: "A fictional faith organization receiving offerings and paying expenses.",
  },
  business: {
    label: "Business",
    description: "A fictional merchant or business account.",
  },
};

const MODEL_DETAILS: Record<
  FundingModel,
  { label: string; shortLabel: string; description: string; badge: string }
> = {
  prepaid: {
    label: "Prepaid wallet",
    shortLabel: "Prepaid",
    description: "Reload first, then spend only the stored wallet balance.",
    badge: "bg-emerald-100 text-emerald-800",
  },
  "bank-linked": {
    label: "Bank-linked wallet",
    shortLabel: "Bank-linked",
    description: "Payments debit the linked bank account directly. No value is stored in the wallet.",
    badge: "bg-blue-100 text-blue-800",
  },
  hybrid: {
    label: "Hybrid wallet",
    shortLabel: "Hybrid",
    description: "Uses stored wallet value first, then the linked bank account for any remainder.",
    badge: "bg-violet-100 text-violet-800",
  },
  "bank-direct": {
    label: "Bank-direct profile",
    shortLabel: "Bank-direct",
    description: "Has no stored-value wallet; incoming and outgoing funds use the bank account.",
    badge: "bg-slate-200 text-slate-800",
  },
};

function isBankOnlyModel(model: FundingModel): boolean {
  return model === "bank-linked" || model === "bank-direct";
}

function makeLegacyFundingSource(
  walletId: string,
  name: string,
  detail: string,
  balance: number
): WalletFundingSource {
  return {
    id: `${walletId}-primary`,
    name,
    detail,
    balance,
    priority: 1,
    isDefault: true,
    enabled: true,
  };
}

function totalFundingSources(sources: WalletFundingSource[]): number {
  return roundMoney(sources.reduce((total, source) => total + source.balance, 0));
}

/**
 * Preserves an existing aggregate bank balance when a built-in profile gains a
 * richer multi-account template in a later application version.
 */
function scaleFundingSources(
  template: WalletFundingSource[],
  totalBalance: number
): WalletFundingSource[] {
  const templateTotal = totalFundingSources(template);
  if (template.length === 0) return [];
  if (templateTotal <= 0) {
    return template.map((source, index) => ({
      ...source,
      balance: index === 0 ? totalBalance : 0,
    }));
  }

  let allocated = 0;
  return template.map((source, index) => {
    const balance =
      index === template.length - 1
        ? roundMoney(totalBalance - allocated)
        : roundMoney(totalBalance * (source.balance / templateTotal));
    allocated = roundMoney(allocated + balance);
    return { ...source, balance };
  });
}

/** Picks the enabled default source, falling back to the lowest priority number. */
function defaultFundingSource(wallet: SimulatedWallet): WalletFundingSource | undefined {
  return (
    wallet.fundingSources.find((source) => source.enabled && source.isDefault) ??
    [...wallet.fundingSources]
      .filter((source) => source.enabled)
      .sort((left, right) => left.priority - right.priority)[0]
  );
}

function createInitialState(): WalletLabState {
  const now = new Date().toISOString();
  const wallets: SimulatedWallet[] = CATALOG_PROFILES.filter(
    (profile) => profile.wallet
  ).map((profile) => {
    const wallet = profile.wallet!;
    const fundingSources =
      wallet.fundingSources ??
      [
        makeLegacyFundingSource(
          profile.id,
          wallet.bankName,
          wallet.bankDetail,
          wallet.bankBalance
        ),
      ];
    return {
      id: profile.id,
      ownerName: profile.name,
      profileKind: profile.kind === "merchant" ? "business" : profile.kind,
      model: wallet.model,
      walletBalance: wallet.walletBalance,
      bankBalance: totalFundingSources(fundingSources),
      bankName: wallet.bankName,
      bankDetail: wallet.bankDetail,
      fundingSources,
      walletIdentifier: wallet.walletIdentifier,
      color: wallet.walletColor,
      isCustom: false,
    };
  });
  const ledger: LedgerEntry[] = wallets.flatMap((wallet) => {
    const entries: LedgerEntry[] = [];
    if (wallet.walletBalance > 0) {
      entries.push({
        id: `opening-${wallet.id}-wallet`,
        ownerId: wallet.id,
        title: "Opening wallet balance",
        detail: `Fictional ${wallet.profileKind} stored value`,
        amount: wallet.walletBalance,
        balanceType: "wallet",
        createdAt: now,
        reference: "WALLET-OPEN",
      });
    }
    for (const source of wallet.fundingSources) {
      if (source.balance <= 0) continue;
      entries.push({
        id: `opening-${wallet.id}-bank-${source.id}`,
        ownerId: wallet.id,
        title: "Opening linked account balance",
        detail: `${source.name} / ${source.detail}`,
        amount: source.balance,
        balanceType: "bank",
        createdAt: now,
        reference: "BANK-OPEN",
      });
    }
    return entries;
  });

  return {
    wallets,
    ledger,
  };
}

function loadState(): WalletLabState {
  try {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!stored) return createInitialState();

    const parsed = JSON.parse(stored) as WalletLabState;
    if (!Array.isArray(parsed.wallets) || !Array.isArray(parsed.ledger)) {
      return createInitialState();
    }
    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

/**
 * Upgrades persisted state without resetting balances or custom profiles.
 *
 * Shared snapshots can opt out of adding newly introduced catalog profiles so
 * a deliberate deletion by collaborators is respected.
 */
function normalizeState(
  state: WalletLabState,
  addMissingCatalogProfiles = true
): WalletLabState {
  const baseline = createInitialState();
  const normalizedWallets = state.wallets.map((wallet, index) => {
    const baselineWallet = baseline.wallets.find((candidate) => candidate.id === wallet.id);
    // Earlier versions represented every profile with one synthetic primary source.
    const hasLegacyPrimaryOnly =
      Array.isArray(wallet.fundingSources) &&
      wallet.fundingSources.length === 1 &&
      wallet.fundingSources[0].id === `${wallet.id}-primary`;
    const fundingSources =
      baselineWallet &&
      baselineWallet.fundingSources.length > 1 &&
      (!Array.isArray(wallet.fundingSources) ||
        wallet.fundingSources.length === 0 ||
        hasLegacyPrimaryOnly)
        ? scaleFundingSources(baselineWallet.fundingSources, wallet.bankBalance)
        : Array.isArray(wallet.fundingSources) && wallet.fundingSources.length > 0
          ? wallet.fundingSources
          : [
              makeLegacyFundingSource(
                wallet.id,
                wallet.bankName,
                wallet.bankDetail,
                wallet.bankBalance
              ),
            ];
    return {
      ...wallet,
      bankBalance: totalFundingSources(fundingSources),
      fundingSources,
      profileKind: wallet.profileKind || ("person" as ProfileKind),
      walletIdentifier:
        wallet.walletIdentifier || `WLT-TEST-${String(index + 1).padStart(4, "0")}`,
      color: wallet.color || PROFILE_COLORS[index % PROFILE_COLORS.length].value,
      isCustom: wallet.isCustom === true,
    };
  });
  const walletIds = new Set(normalizedWallets.map((wallet) => wallet.id));
  const ledgerIds = new Set(state.ledger.map((entry) => entry.id));
  const missingWallets = addMissingCatalogProfiles
    ? baseline.wallets.filter((wallet) => !walletIds.has(wallet.id))
    : [];
  const missingWalletIds = new Set(missingWallets.map((wallet) => wallet.id));

  return {
    wallets: [...normalizedWallets, ...missingWallets],
    ledger: [
      ...state.ledger,
      ...baseline.ledger.filter(
        (entry) => missingWalletIds.has(entry.ownerId) && !ledgerIds.has(entry.id)
      ),
    ],
  };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-BB", {
    style: "currency",
    currency: "BBD",
  }).format(value);
}

function makeReference(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

function syntheticAccountReference(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `9${hash.toString().padStart(14, "0").slice(-14)}`;
}

/** Resolves catalog routing or stable test routing for a custom wallet. */
function walletQrRouting(wallet: SimulatedWallet) {
  const profile = CATALOG_PROFILES.find((candidate) => candidate.id === wallet.id);
  const usesRouteTwo = wallet.walletIdentifier.length % 2 === 0;
  return {
    accountReference:
      profile?.accountReference ?? syntheticAccountReference(wallet.walletIdentifier),
    financialInstitutionAlias:
      profile?.financialInstitutionAlias ?? (usesRouteTwo ? "TESTROC2" : "TESTROC1"),
    branchAlias: profile?.branchAlias ?? (usesRouteTwo ? "TESTROC2" : "TESTROC1"),
    participantCode: profile?.participantCode ?? (usesRouteTwo ? "333332" : "333331"),
    merchantCategoryCode:
      profile?.kind === "merchant"
        ? profile.merchantCategoryCode
        : wallet.profileKind === "charity"
          ? "8398"
          : wallet.profileKind === "church"
            ? "8661"
            : "0000",
    city: profile?.kind === "merchant" ? profile.location : "Bridgetown",
  };
}

/** Builds the same variable-amount EMV-style payload used by the QR generator. */
function buildWalletEmvPayload(wallet: SimulatedWallet): string {
  const routing = walletQrRouting(wallet);
  return buildSandboxEmvPayload({
    recipientName: wallet.ownerName,
    city: routing.city,
    accountReference: routing.accountReference,
    participantCode: routing.participantCode,
    financialInstitutionAlias: routing.financialInstitutionAlias,
    branchAlias: routing.branchAlias,
    merchantCategoryCode: routing.merchantCategoryCode,
    amount: "0.00",
    amountMode: "variable",
    initiationMethod: "11",
    reference: `STATIC ${wallet.walletIdentifier}`.slice(0, 25),
    storeLabel: wallet.walletIdentifier.slice(0, 25),
  });
}

/** Builds a fixed-amount EMV-style payload for the RTP QR. */
function buildRtpEmvPayload(
  request: WalletPaymentRequest,
  requester: SimulatedWallet
): string {
  const routing = walletQrRouting(requester);
  return buildSandboxEmvPayload({
    recipientName: requester.ownerName,
    city: routing.city,
    accountReference: routing.accountReference,
    participantCode: routing.participantCode,
    financialInstitutionAlias: routing.financialInstitutionAlias,
    branchAlias: routing.branchAlias,
    merchantCategoryCode: routing.merchantCategoryCode,
    amount: request.amount.toFixed(2),
    amountMode: "fixed",
    initiationMethod: "12",
    reference: `RTP ${request.id.slice(0, 8)}`,
    storeLabel: requester.walletIdentifier.slice(0, 25),
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function WalletLabPage() {
  const [lab, setLab] = useState<WalletLabState>(loadState);
  const [activeWalletId, setActiveWalletId] = useState(PEOPLE[0].id);
  const [action, setAction] = useState<WalletAction>("reload");
  const [amount, setAmount] = useState("25.00");
  const [merchantId, setMerchantId] = useState(MERCHANTS[0].id);
  const [recipientId, setRecipientId] = useState(PEOPLE[1].id);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showWalletCatalog, setShowWalletCatalog] = useState(false);
  const [visibleWalletQrId, setVisibleWalletQrId] = useState("");
  const [staticQrFormat, setStaticQrFormat] = useState<StaticQrFormat>("link");
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileFields, setProfileFields] =
    useState<WalletProfileFields>(DEFAULT_PROFILE_FIELDS);
  const [profileMessage, setProfileMessage] = useState("");
  const [sharedSession, setSharedSession] = useState<SharedWorkspaceSession | null>(null);
  const [transactionBusy, setTransactionBusy] = useState(false);
  const [adjustmentBalanceType, setAdjustmentBalanceType] =
    useState<BalanceType>("wallet");
  const [fundingSourceId, setFundingSourceId] = useState("");
  const [rtpPayerId, setRtpPayerId] = useState(PEOPLE[1].id);
  const [rtpFundingSourceId, setRtpFundingSourceId] = useState("");
  const [paymentRequest, setPaymentRequest] = useState<WalletPaymentRequest | null>(null);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceDetail, setNewSourceDetail] = useState("");
  const [newSourceBalance, setNewSourceBalance] = useState("0.00");
  const pendingRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(
    null
  );

  const activeWallet =
    lab.wallets.find((wallet) => wallet.id === activeWalletId) ?? lab.wallets[0];
  const selectedMerchant =
    MERCHANTS.find((merchant) => merchant.id === merchantId) ?? MERCHANTS[0];
  const recipientWallet =
    lab.wallets.find((wallet) => wallet.id === recipientId) ??
    lab.wallets.find((wallet) => wallet.id !== activeWallet.id) ??
    lab.wallets[0];
  const rtpPayer =
    lab.wallets.find((wallet) => wallet.id === rtpPayerId) ??
    lab.wallets.find((wallet) => wallet.id !== activeWallet.id) ??
    lab.wallets[0];
  const activeLedger = useMemo(
    () => lab.ledger.filter((entry) => entry.ownerId === activeWallet.id),
    [activeWallet.id, lab.ledger]
  );
  const selectedFundingSource =
    activeWallet.fundingSources.find((source) => source.id === fundingSourceId) ??
    defaultFundingSource(activeWallet);
  const selectedRtpFundingSource =
    rtpPayer.fundingSources.find((source) => source.id === rtpFundingSourceId) ??
    defaultFundingSource(rtpPayer);
  const totalAvailable =
    activeWallet.model === "prepaid"
      ? activeWallet.walletBalance
      : isBankOnlyModel(activeWallet.model)
        ? activeWallet.bankBalance
        : activeWallet.walletBalance + activeWallet.bankBalance;
  const activeWalletEmv = buildWalletEmvPayload(activeWallet);
  const activeWalletQrPayload =
    staticQrFormat === "emv"
      ? activeWalletEmv
      : `${window.location.origin}/pay?emv=${encodeURIComponent(activeWalletEmv)}`;

  function persist(nextState: WalletLabState): void {
    setLab(nextState);
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(nextState));
  }

  function openNewProfile(): void {
    setEditingProfileId("");
    setProfileFields({
      ...DEFAULT_PROFILE_FIELDS,
      walletIdentifier: `WLT-CUSTOM-${Date.now().toString().slice(-6)}`,
    });
    setProfileMessage("");
    setShowProfileEditor(true);
  }

  function openEditProfile(wallet: SimulatedWallet): void {
    if (!wallet.isCustom) return;
    setEditingProfileId(wallet.id);
    setProfileFields({
      ownerName: wallet.ownerName,
      profileKind: wallet.profileKind,
      model: wallet.model,
      walletBalance: wallet.walletBalance.toFixed(2),
      bankBalance: wallet.bankBalance.toFixed(2),
      bankName: wallet.bankName,
      bankDetail: wallet.bankDetail,
      walletIdentifier: wallet.walletIdentifier,
      color: wallet.color,
    });
    setProfileMessage("");
    setShowProfileEditor(true);
  }

  function validateProfileFields(): { walletBalance: number; bankBalance: number } | null {
    const walletBalance = roundMoney(Number(profileFields.walletBalance));
    const bankBalance = roundMoney(Number(profileFields.bankBalance));
    if (!profileFields.ownerName.trim()) {
      setProfileMessage("Enter a profile owner or display name.");
      return null;
    }
    if (!profileFields.walletIdentifier.trim()) {
      setProfileMessage("Enter a fictional wallet identifier.");
      return null;
    }
    if (
      lab.wallets.some(
        (wallet) =>
          wallet.id !== editingProfileId &&
          wallet.walletIdentifier.toLowerCase() ===
            profileFields.walletIdentifier.trim().toLowerCase()
      )
    ) {
      setProfileMessage("That wallet identifier is already used by another profile.");
      return null;
    }
    if (
      !Number.isFinite(walletBalance) ||
      !Number.isFinite(bankBalance) ||
      walletBalance < 0 ||
      bankBalance < 0 ||
      walletBalance > 100000 ||
      bankBalance > 100000
    ) {
      setProfileMessage("Opening balances must be between $0.00 and $100,000.00 BBD.");
      return null;
    }
    if (isBankOnlyModel(profileFields.model) && walletBalance !== 0) {
      setProfileMessage("A bank-only profile cannot begin with stored wallet value.");
      return null;
    }
    return { walletBalance, bankBalance };
  }

  function saveProfile(): void {
    const balances = validateProfileFields();
    if (!balances) return;

    const existing = lab.wallets.find((wallet) => wallet.id === editingProfileId);
    const profileId = existing?.id ?? `custom-wallet-${crypto.randomUUID()}`;
    const wallet: SimulatedWallet = {
      id: profileId,
      ownerName: profileFields.ownerName.trim().slice(0, 60),
      profileKind: profileFields.profileKind,
      model: profileFields.model,
      walletBalance: balances.walletBalance,
      bankBalance: balances.bankBalance,
      bankName: profileFields.bankName.trim().slice(0, 60) || "Test Bank",
      bankDetail: profileFields.bankDetail.trim().slice(0, 60) || "Test account",
      fundingSources: existing?.fundingSources ?? [
        makeLegacyFundingSource(
          profileId,
          profileFields.bankName.trim().slice(0, 60) || "Test Bank",
          profileFields.bankDetail.trim().slice(0, 60) || "Test account",
          balances.bankBalance
        ),
      ],
      walletIdentifier: profileFields.walletIdentifier.trim().slice(0, 40),
      color: profileFields.color,
      isCustom: true,
    };
    if (!existing) {
      wallet.bankBalance = totalFundingSources(wallet.fundingSources);
    } else if (balances.bankBalance !== existing.bankBalance) {
      const source = defaultFundingSource(wallet);
      if (source) {
        const nextSourceBalance = roundMoney(
          source.balance + balances.bankBalance - existing.bankBalance
        );
        if (nextSourceBalance < 0) {
          setProfileMessage(
            "That aggregate edit would make the default linked account negative. Adjust individual accounts instead."
          );
          return;
        }
        wallet.fundingSources = wallet.fundingSources.map((candidate) =>
          candidate.id === source.id
            ? {
                ...candidate,
                balance: nextSourceBalance,
              }
            : candidate
        );
        wallet.bankBalance = totalFundingSources(wallet.fundingSources);
      }
    }
    const nextWallets = existing
      ? updateWallet(lab.wallets, profileId, wallet)
      : [...lab.wallets, wallet];
    const reference = makeReference(existing ? "ADJUST" : "PROFILE");
    let nextLedger: LedgerEntry[];
    if (existing) {
      const entries: LedgerEntry[] = [];
      const walletDifference = roundMoney(wallet.walletBalance - existing.walletBalance);
      const bankDifference = roundMoney(wallet.bankBalance - existing.bankBalance);
      if (walletDifference !== 0) {
        entries.push(
          addEntry(
            wallet.id,
            "Profile balance adjustment",
            "Stored wallet balance edited",
            walletDifference,
            "wallet",
            reference
          )
        );
      }
      if (bankDifference !== 0) {
        entries.push(
          addEntry(
            wallet.id,
            "Profile balance adjustment",
            "Linked bank balance edited",
            bankDifference,
            "bank",
            reference
          )
        );
      }
      nextLedger = [...entries, ...lab.ledger];
    } else {
      const entries: LedgerEntry[] = [];
      if (wallet.walletBalance > 0) {
        entries.push(
          addEntry(
            wallet.id,
            "Opening wallet balance",
            "Custom profile opening value",
            wallet.walletBalance,
            "wallet",
            reference
          )
        );
      }
      if (wallet.bankBalance > 0) {
        entries.push(
          addEntry(
            wallet.id,
            "Opening linked bank balance",
            `${wallet.bankName} / ${wallet.bankDetail}`,
            wallet.bankBalance,
            "bank",
            reference
          )
        );
      }
      nextLedger = [...entries, ...lab.ledger];
    }
    persist({ wallets: nextWallets, ledger: nextLedger });
    selectWalletAfterMutation(wallet, nextWallets);
    setShowProfileEditor(false);
    setProfileMessage("");
    setMessage(existing ? "Custom wallet profile updated." : "Custom wallet profile created.");
  }

  function selectWalletAfterMutation(
    wallet: SimulatedWallet,
    wallets: SimulatedWallet[]
  ): void {
    setActiveWalletId(wallet.id);
    setRecipientId(wallets.find((candidate) => candidate.id !== wallet.id)?.id ?? wallet.id);
    setAction(isBankOnlyModel(wallet.model) ? "merchant" : "reload");
  }

  function cloneProfile(wallet: SimulatedWallet): void {
    setEditingProfileId("");
    setProfileFields({
      ownerName: `${wallet.ownerName} Copy`,
      profileKind: wallet.profileKind,
      model: wallet.model,
      walletBalance: wallet.walletBalance.toFixed(2),
      bankBalance: wallet.bankBalance.toFixed(2),
      bankName: wallet.bankName,
      bankDetail: wallet.bankDetail,
      walletIdentifier: `WLT-COPY-${Date.now().toString().slice(-6)}`,
      color: wallet.color,
    });
    setProfileMessage("");
    setShowProfileEditor(true);
  }

  function deleteProfile(wallet: SimulatedWallet): void {
    if (!wallet.isCustom) return;
    if (!window.confirm(`Delete ${wallet.ownerName} and its local transaction history?`)) {
      return;
    }
    const nextWallets = lab.wallets.filter((candidate) => candidate.id !== wallet.id);
    const nextLedger = lab.ledger.filter((entry) => entry.ownerId !== wallet.id);
    const fallbackWallet = nextWallets[0];
    persist({ wallets: nextWallets, ledger: nextLedger });
    if (activeWalletId === wallet.id && fallbackWallet) {
      setActiveWalletId(fallbackWallet.id);
      setRecipientId(
        nextWallets.find((candidate) => candidate.id !== fallbackWallet.id)?.id ??
          fallbackWallet.id
      );
      setAction(isBankOnlyModel(fallbackWallet.model) ? "merchant" : "reload");
    } else if (recipientId === wallet.id) {
      setRecipientId(
        nextWallets.find((candidate) => candidate.id !== activeWalletId)?.id ??
          activeWalletId
      );
    }
    setShowProfileEditor(false);
    setMessage("Custom wallet profile and its local ledger entries were removed.");
  }

  function selectWallet(walletId: string): void {
    const nextWallet = lab.wallets.find((wallet) => wallet.id === walletId);
    if (!nextWallet) return;
    const nextRtpPayer =
      lab.wallets.find((wallet) => wallet.id !== walletId) ?? nextWallet;

    setActiveWalletId(walletId);
    setFundingSourceId(defaultFundingSource(nextWallet)?.id ?? "");
    setRecipientId(lab.wallets.find((wallet) => wallet.id !== walletId)?.id ?? walletId);
    setRtpPayerId(nextRtpPayer.id);
    setRtpFundingSourceId(defaultFundingSource(nextRtpPayer)?.id ?? "");
    setPaymentRequest(null);
    setAction(isBankOnlyModel(nextWallet.model) ? "merchant" : "reload");
    setAmount(isBankOnlyModel(nextWallet.model) ? "12.50" : "25.00");
    setMessage("");
    setNote("");
  }

  function switchAction(nextAction: WalletAction): void {
    setAction(nextAction);
    setAmount(nextAction === "reload" ? "25.00" : "12.50");
    setPaymentRequest(null);
    setMessage("");
    setNote("");
  }

  function selectRtpPayer(walletId: string): void {
    const payer = lab.wallets.find((wallet) => wallet.id === walletId);
    if (!payer) return;

    setRtpPayerId(walletId);
    setRtpFundingSourceId(defaultFundingSource(payer)?.id ?? "");
    setPaymentRequest(null);
    setMessage("");
  }

  /** Creates a local, test-only request that can be encoded directly into a QR. */
  function createPaymentRequest(): void {
    const requestAmount = roundMoney(Number(amount));
    if (!Number.isFinite(requestAmount) || requestAmount <= 0 || requestAmount > 5000) {
      setMessage("Enter an RTP amount from $0.01 to $5,000.00 BBD.");
      return;
    }
    if (rtpPayer.id === activeWallet.id) {
      setMessage("Choose another wallet to act as the payer.");
      return;
    }

    setPaymentRequest({
      id: crypto.randomUUID(),
      requesterId: activeWallet.id,
      payerId: rtpPayer.id,
      amount: requestAmount,
      note: note.trim() || "Wallet payment request",
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    setMessage("Request created. The payer can scan the sandbox QR and approve it below.");
  }

  /**
   * Simulates payer approval by debiting the requested payer and crediting the
   * active requester. Shared workspaces use the same atomic transfer RPC as a
   * normal wallet-to-wallet payment.
   */
  async function approvePaymentRequest(): Promise<void> {
    if (!paymentRequest || paymentRequest.status !== "pending") return;
    const requester = lab.wallets.find(
      (wallet) => wallet.id === paymentRequest.requesterId
    );
    const payer = lab.wallets.find((wallet) => wallet.id === paymentRequest.payerId);
    if (!requester || !payer) {
      setMessage("One of the wallets in this request is no longer available.");
      return;
    }
    if (sharedSession?.role === "viewer") {
      setMessage("Viewers cannot approve shared payment requests.");
      return;
    }

    const reference = `RTP-${paymentRequest.id.slice(0, 8).toUpperCase()}`;
    setTransactionBusy(true);
    setMessage("");

    try {
      if (sharedSession) {
        const result = await transferSharedWallets({
          workspaceId: sharedSession.workspaceId,
          payerProfileId: payer.id,
          recipientProfileId: requester.id,
          amount: paymentRequest.amount,
          detail: `RTP: ${paymentRequest.note}`,
          reference,
          idempotencyKey: paymentRequest.id,
          fundingSourceId: selectedRtpFundingSource?.id,
        });
        try {
          await refreshSharedState({ ...sharedSession, revision: result.revision });
        } catch {
          setPaymentRequest({ ...paymentRequest, status: "paid" });
          setMessage(
            "The RTP approval committed, but this browser could not refresh. Use Load shared to retrieve the new balances; retrying this request remains idempotent."
          );
          return;
        }
      } else {
        const funded = fundPayment(
          payer,
          selectedRtpFundingSource,
          paymentRequest.amount,
          reference,
          `Paid request from ${requester.ownerName}`,
          paymentRequest.note
        );
        if (!funded) {
          setMessage(
            `The payer has insufficient ${MODEL_DETAILS[payer.model].shortLabel.toLowerCase()} funds.`
          );
          return;
        }

        const recipientBalanceType: BalanceType = isBankOnlyModel(requester.model)
          ? "bank"
          : "wallet";
        const recipientSource = defaultFundingSource(requester);
        const recipientFundingSources =
          recipientBalanceType === "bank" && recipientSource
            ? requester.fundingSources.map((source) =>
                source.id === recipientSource.id
                  ? {
                      ...source,
                      balance: roundMoney(source.balance + paymentRequest.amount),
                    }
                  : source
              )
            : requester.fundingSources;
        const requesterUpdates =
          recipientBalanceType === "bank"
            ? {
                bankBalance: totalFundingSources(recipientFundingSources),
                fundingSources: recipientFundingSources,
              }
            : {
                walletBalance: roundMoney(
                  requester.walletBalance + paymentRequest.amount
                ),
              };
        let nextWallets = updateWallet(lab.wallets, payer.id, funded.wallet);
        nextWallets = updateWallet(nextWallets, requester.id, requesterUpdates);
        persist({
          wallets: nextWallets,
          ledger: [
            addEntry(
              requester.id,
              `RTP received from ${payer.ownerName}`,
              paymentRequest.note,
              paymentRequest.amount,
              recipientBalanceType,
              reference
            ),
            ...funded.entries,
            ...lab.ledger,
          ],
        });
      }

      setPaymentRequest({ ...paymentRequest, status: "paid" });
      setMessage(
        `${formatMoney(paymentRequest.amount)} was approved by ${payer.ownerName} and credited to ${requester.ownerName}.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The payment request could not be approved."
      );
    } finally {
      setTransactionBusy(false);
    }
  }

  function addFundingSource(): void {
    const balance = roundMoney(Number(newSourceBalance));
    if (!newSourceName.trim() || !Number.isFinite(balance) || balance < 0 || balance > 100000) {
      setMessage("Enter an account name and a balance from $0.00 to $100,000.00 BBD.");
      return;
    }
    const source: WalletFundingSource = {
      id: `source-${crypto.randomUUID()}`,
      name: newSourceName.trim().slice(0, 60),
      detail: newSourceDetail.trim().slice(0, 60) || "Linked account",
      balance,
      priority: activeWallet.fundingSources.length + 1,
      isDefault: activeWallet.fundingSources.length === 0,
      enabled: true,
    };
    const fundingSources = [...activeWallet.fundingSources, source];
    persist({
      ...lab,
      wallets: updateWallet(lab.wallets, activeWallet.id, {
        fundingSources,
        bankBalance: totalFundingSources(fundingSources),
        bankDetail: `${fundingSources.length} linked accounts`,
      }),
    });
    setFundingSourceId(source.id);
    setNewSourceName("");
    setNewSourceDetail("");
    setNewSourceBalance("0.00");
    setMessage("Linked funding account added. Publish the workspace to share this change.");
  }

  function setDefaultFundingSource(sourceId: string): void {
    const fundingSources = activeWallet.fundingSources.map((source) => ({
      ...source,
      isDefault: source.id === sourceId,
    }));
    persist({
      ...lab,
      wallets: updateWallet(lab.wallets, activeWallet.id, { fundingSources }),
    });
    setFundingSourceId(sourceId);
  }

  function removeFundingSource(sourceId: string): void {
    if (activeWallet.fundingSources.length <= 1) {
      setMessage("A wallet must retain at least one linked funding account.");
      return;
    }
    const removed = activeWallet.fundingSources.find((source) => source.id === sourceId);
    let fundingSources = activeWallet.fundingSources.filter((source) => source.id !== sourceId);
    if (removed?.isDefault) {
      fundingSources = fundingSources.map((source, index) => ({
        ...source,
        isDefault: index === 0,
      }));
    }
    persist({
      ...lab,
      wallets: updateWallet(lab.wallets, activeWallet.id, {
        fundingSources,
        bankBalance: totalFundingSources(fundingSources),
        bankDetail: `${fundingSources.length} linked accounts`,
      }),
    });
    setFundingSourceId(defaultFundingSource({ ...activeWallet, fundingSources })?.id ?? "");
    setMessage("Linked funding account removed from this sandbox profile.");
  }

  function updateWallet(
    wallets: SimulatedWallet[],
    walletId: string,
    updates: Partial<SimulatedWallet>
  ): SimulatedWallet[] {
    return wallets.map((wallet) => (wallet.id === walletId ? { ...wallet, ...updates } : wallet));
  }

  function addEntry(
    ownerId: string,
    title: string,
    detail: string,
    amountValue: number,
    balanceType: BalanceType,
    reference: string
  ): LedgerEntry {
    return {
      id: crypto.randomUUID(),
      ownerId,
      title,
      detail,
      amount: amountValue,
      balanceType,
      createdAt: new Date().toISOString(),
      reference,
    };
  }

  /**
   * Calculates a local debit and its ledger entries.
   *
   * Hybrid fallback is intentionally limited to one selected account. Available
   * funds in another source never authorize an implicit cross-account split.
   */
  function fundPayment(
    wallet: SimulatedWallet,
    fundingSource: WalletFundingSource | undefined,
    paymentAmount: number,
    reference: string,
    title: string,
    detail: string
  ): { wallet: SimulatedWallet; entries: LedgerEntry[]; fundingDescription: string } | null {
    if (wallet.model === "prepaid") {
      if (paymentAmount > wallet.walletBalance) return null;
      return {
        wallet: {
          ...wallet,
          walletBalance: roundMoney(wallet.walletBalance - paymentAmount),
        },
        entries: [
          addEntry(wallet.id, title, detail, -paymentAmount, "wallet", reference),
        ],
        fundingDescription: "stored wallet value",
      };
    }

    if (isBankOnlyModel(wallet.model)) {
      if (!fundingSource || paymentAmount > fundingSource.balance) return null;
      const fundingSources = wallet.fundingSources.map((source) =>
        source.id === fundingSource.id
          ? { ...source, balance: roundMoney(source.balance - paymentAmount) }
          : source
      );
      return {
        wallet: {
          ...wallet,
          bankBalance: totalFundingSources(fundingSources),
          fundingSources,
        },
        entries: [
          addEntry(
            wallet.id,
            title,
            `${detail} / ${fundingSource.name} / ${fundingSource.detail}`,
            -paymentAmount,
            "bank",
            reference
          ),
        ],
        fundingDescription: `${fundingSource.name} (${fundingSource.detail})`,
      };
    }

    const walletPortion = Math.min(paymentAmount, wallet.walletBalance);
    const bankPortion = roundMoney(paymentAmount - walletPortion);
    if (bankPortion > 0 && (!fundingSource || bankPortion > fundingSource.balance)) {
      return null;
    }
    const entries: LedgerEntry[] = [];
    if (walletPortion > 0) {
      entries.push(
        addEntry(
          wallet.id,
          title,
          `${detail} / wallet portion`,
          -walletPortion,
          "wallet",
          reference
        )
      );
    }
    if (bankPortion > 0) {
      entries.push(
        addEntry(
          wallet.id,
          title,
          `${detail} / ${fundingSource!.name} / ${fundingSource!.detail}`,
          -bankPortion,
          "bank",
          reference
        )
      );
    }
    // Apply the bank-funded portion to the selected source only.
    const fundingSources =
      bankPortion > 0
        ? wallet.fundingSources.map((source) =>
            source.id === fundingSource!.id
              ? { ...source, balance: roundMoney(source.balance - bankPortion) }
              : source
          )
        : wallet.fundingSources;
    return {
      wallet: {
        ...wallet,
        walletBalance: roundMoney(wallet.walletBalance - walletPortion),
        bankBalance: totalFundingSources(fundingSources),
        fundingSources,
      },
      entries,
      fundingDescription:
        bankPortion > 0 && walletPortion > 0
          ? `wallet value plus ${fundingSource!.name}`
          : bankPortion > 0
            ? `${fundingSource!.name} (${fundingSource!.detail})`
            : "stored wallet value",
    };
  }

  /** Reloads committed server state after an atomic operation. */
  async function refreshSharedState(
    session: SharedWorkspaceSession
  ): Promise<WalletLabState> {
    const snapshot = await loadSharedWalletState(session.workspaceId);
    const normalizedState = normalizeState(snapshot.state, false);
    persist(normalizedState);
    setSharedSession({ ...session, revision: snapshot.revision });
    return normalizedState;
  }

  /**
   * Dispatches a financial operation to a source-aware atomic RPC.
   *
   * The fingerprint retains the same idempotency key for a user retry of an
   * unchanged form, but creates a new key when transaction inputs change.
   */
  async function submitSharedTransaction(transactionAmount: number): Promise<void> {
    if (!sharedSession) return;
    if (sharedSession.role === "viewer") {
      setMessage("Viewers cannot execute shared wallet transactions.");
      return;
    }

    const reference = makeReference(
      action === "reload"
        ? "TOPUP"
        : action === "merchant"
          ? "PAY"
          : action === "transfer"
            ? "SEND"
            : "ADJUST"
    );
    const detail =
      note.trim() ||
      (action === "merchant" ? selectedMerchant.category : "Cross-wallet transfer");
    const fingerprint = JSON.stringify({
      workspaceId: sharedSession.workspaceId,
      action,
      activeWalletId: activeWallet.id,
      recipientId: action === "transfer" ? recipientWallet.id : "",
      merchantId: action === "merchant" ? selectedMerchant.id : "",
      fundingSourceId: selectedFundingSource?.id ?? "",
      adjustmentBalanceType: action === "adjust" ? adjustmentBalanceType : "",
      transactionAmount,
      detail,
    });
    const idempotencyKey =
      pendingRequestRef.current?.fingerprint === fingerprint
        ? pendingRequestRef.current.idempotencyKey
        : crypto.randomUUID();
    pendingRequestRef.current = { fingerprint, idempotencyKey };

    setTransactionBusy(true);
    setMessage("");
    try {
      const result =
        action === "reload"
          ? await reloadSharedWallet({
              workspaceId: sharedSession.workspaceId,
              profileId: activeWallet.id,
              amount: transactionAmount,
              reference,
              idempotencyKey,
              fundingSourceId: selectedFundingSource?.id,
            })
          : action === "merchant"
            ? await paySharedMerchant({
                workspaceId: sharedSession.workspaceId,
                payerProfileId: activeWallet.id,
                amount: transactionAmount,
                merchantName: selectedMerchant.name,
                detail,
                reference,
                idempotencyKey,
                fundingSourceId: selectedFundingSource?.id,
              })
            : action === "transfer"
              ? await transferSharedWallets({
                workspaceId: sharedSession.workspaceId,
                payerProfileId: activeWallet.id,
                recipientProfileId: recipientWallet.id,
                amount: transactionAmount,
                detail,
                reference,
                idempotencyKey,
                fundingSourceId: selectedFundingSource?.id,
              })
              : await adjustSharedBalance({
                  workspaceId: sharedSession.workspaceId,
                  profileId: activeWallet.id,
                  balanceType: adjustmentBalanceType,
                  amount: transactionAmount,
                  reason: note.trim() || "Explicit sandbox balance adjustment",
                  reference,
                  idempotencyKey,
                  fundingSourceId: selectedFundingSource?.id,
                });

      try {
        await refreshSharedState({ ...sharedSession, revision: result.revision });
      } catch {
        setMessage(
          "The transaction committed, but this browser could not refresh. Use Load shared before continuing; retrying the same form remains idempotent."
        );
        return;
      }
      pendingRequestRef.current = null;
      setMessage(
        action === "reload"
          ? `${formatMoney(transactionAmount)} was atomically moved from bank funds into stored value.`
          : action === "merchant"
            ? `${formatMoney(transactionAmount)} was atomically paid using ${result.fundingDescription ?? "the configured funding model"}.`
            : action === "transfer"
              ? `${formatMoney(transactionAmount)} was atomically transferred to ${recipientWallet.ownerName}.`
              : `${formatMoney(transactionAmount)} adjusted the ${adjustmentBalanceType} balance atomically.`
      );
      setNote("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The shared transaction could not be completed."
      );
    } finally {
      setTransactionBusy(false);
    }
  }

  async function submitTransaction(): Promise<void> {
    const numericAmount = Number(amount);
    const transactionAmount = roundMoney(numericAmount);
    const amountIsInvalid =
      action === "adjust"
        ? !Number.isFinite(numericAmount) ||
          transactionAmount === 0 ||
          Math.abs(transactionAmount) > 100000
        : !Number.isFinite(numericAmount) ||
          transactionAmount <= 0 ||
          transactionAmount > 5000;
    if (amountIsInvalid) {
      setMessage(
        action === "adjust"
          ? "Enter a non-zero adjustment from -$100,000.00 to $100,000.00 BBD."
          : "Enter an amount from $0.01 to $5,000.00 BBD."
      );
      return;
    }

    if (sharedSession) {
      await submitSharedTransaction(transactionAmount);
      return;
    }

    if (action === "reload") {
      if (isBankOnlyModel(activeWallet.model)) {
        setMessage("A bank-only profile has no stored-value balance to reload.");
        return;
      }
      if (!selectedFundingSource || transactionAmount > selectedFundingSource.balance) {
        setMessage("The selected linked account does not have enough available funds.");
        return;
      }

      const reference = makeReference("TOPUP");
      const fundingSources = activeWallet.fundingSources.map((source) =>
        source.id === selectedFundingSource.id
          ? { ...source, balance: roundMoney(source.balance - transactionAmount) }
          : source
      );
      const updatedWallet: SimulatedWallet = {
        ...activeWallet,
        walletBalance: roundMoney(activeWallet.walletBalance + transactionAmount),
        bankBalance: totalFundingSources(fundingSources),
        fundingSources,
      };
      persist({
        wallets: updateWallet(lab.wallets, activeWallet.id, updatedWallet),
        ledger: [
          addEntry(
            activeWallet.id,
            "Wallet reloaded",
            `${selectedFundingSource.name} / ${selectedFundingSource.detail}`,
            transactionAmount,
            "wallet",
            reference
          ),
          addEntry(
            activeWallet.id,
            "Bank funded wallet reload",
            "Value moved into the wallet",
            -transactionAmount,
            "bank",
            reference
          ),
          ...lab.ledger,
        ],
      });
      setMessage(
        `${formatMoney(transactionAmount)} moved from the linked bank account into stored value.`
      );
      return;
    }

    const reference = makeReference(action === "merchant" ? "PAY" : "SEND");
    const title =
      action === "merchant"
        ? `Paid ${selectedMerchant.name}`
        : `Sent to ${recipientWallet.ownerName}`;
    const detail =
      note.trim() ||
      (action === "merchant" ? selectedMerchant.category : "Cross-wallet transfer");
    const funded = fundPayment(
      activeWallet,
      selectedFundingSource,
      transactionAmount,
      reference,
      title,
      detail
    );
    if (!funded) {
      setMessage(`Insufficient ${MODEL_DETAILS[activeWallet.model].shortLabel.toLowerCase()} funds.`);
      return;
    }

    let nextWallets = updateWallet(lab.wallets, activeWallet.id, funded.wallet);
    let nextLedger = [...funded.entries, ...lab.ledger];

    if (action === "transfer") {
      const recipientBalanceType: BalanceType =
        isBankOnlyModel(recipientWallet.model) ? "bank" : "wallet";
      const recipientSource = defaultFundingSource(recipientWallet);
      const recipientFundingSources =
        recipientBalanceType === "bank" && recipientSource
          ? recipientWallet.fundingSources.map((source) =>
              source.id === recipientSource.id
                ? { ...source, balance: roundMoney(source.balance + transactionAmount) }
                : source
            )
          : recipientWallet.fundingSources;
      const recipientUpdates =
        recipientBalanceType === "bank"
          ? {
              bankBalance: totalFundingSources(recipientFundingSources),
              fundingSources: recipientFundingSources,
            }
          : { walletBalance: roundMoney(recipientWallet.walletBalance + transactionAmount) };
      nextWallets = updateWallet(nextWallets, recipientWallet.id, recipientUpdates);
      nextLedger = [
        addEntry(
          recipientWallet.id,
          `Received from ${activeWallet.ownerName}`,
          `${MODEL_DETAILS[activeWallet.model].shortLabel} to ${MODEL_DETAILS[recipientWallet.model].shortLabel}`,
          transactionAmount,
          recipientBalanceType,
          reference
        ),
        ...nextLedger,
      ];
    }

    persist({ wallets: nextWallets, ledger: nextLedger });
    setMessage(
      action === "merchant"
        ? `${formatMoney(transactionAmount)} was paid using ${funded.fundingDescription}.`
        : `${formatMoney(transactionAmount)} moved from the ${MODEL_DETAILS[activeWallet.model].shortLabel.toLowerCase()} wallet to the ${MODEL_DETAILS[recipientWallet.model].shortLabel.toLowerCase()} wallet.`
    );
    setNote("");
  }

  function resetLab(): void {
    const nextState = createInitialState();
    persist(nextState);
    setActiveWalletId(PEOPLE[0].id);
    setRecipientId(PEOPLE[1].id);
    setRtpPayerId(PEOPLE[1].id);
    setRtpFundingSourceId(defaultFundingSource(nextState.wallets[1])?.id ?? "");
    setPaymentRequest(null);
    setAction("reload");
    setMessage("All wallet models and balances were reset.");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-800 via-teal-700 to-cyan-700 p-7 text-white shadow-xl sm:p-10">
        <div className="max-w-4xl">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">
            Interoperable funding-model simulation
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Wallet Funding Lab
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-emerald-50/80">
            Compare prepaid, bank-linked, hybrid, and bank-direct FinTech funding behavior.
            Profiles can pay merchants or transfer to another model while wallet and bank
            balances update independently.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <ExperimentalWarning />
      </div>

      <WalletCollaborationPanel
        state={lab}
        session={sharedSession}
        onSessionChange={setSharedSession}
        onLoad={(sharedState) => {
          persist(sharedState);
          const firstWallet = sharedState.wallets[0];
          if (firstWallet) {
            const secondWallet =
              sharedState.wallets.find((wallet) => wallet.id !== firstWallet.id) ??
              firstWallet;
            setActiveWalletId(firstWallet.id);
            setRecipientId(secondWallet.id);
            setRtpPayerId(secondWallet.id);
            setRtpFundingSourceId(defaultFundingSource(secondWallet)?.id ?? "");
            setPaymentRequest(null);
            setAction(isBankOnlyModel(firstWallet.model) ? "merchant" : "reload");
          }
        }}
      />

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Active wallet and funding model
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Built-in profiles are read-only. Clone one or create your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              type="button"
              aria-expanded={showWalletCatalog}
              onClick={() => setShowWalletCatalog((current) => !current)}
            >
              {showWalletCatalog
                ? "Collapse wallet accounts"
                : `Show ${lab.wallets.length} wallet accounts`}
            </button>
            <button
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
              type="button"
              onClick={openNewProfile}
            >
              Create custom wallet
            </button>
          </div>
        </div>
        {showWalletCatalog && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lab.wallets.map((wallet) => (
              <article
              className={`rounded-2xl border p-4 transition ${
                wallet.id === activeWallet.id
                  ? "border-slate-950 bg-slate-950 text-white shadow-lg"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
                key={wallet.id}
              >
                <button
                  className="w-full text-left"
                  type="button"
                  onClick={() => selectWallet(wallet.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                  <div className="font-black">{wallet.ownerName}</div>
                  {wallet.isCustom && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide ${
                        wallet.id === activeWallet.id
                          ? "bg-white/15 text-white"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      Custom
                    </span>
                  )}
                  </div>
                <div
                  className={`mt-2 text-[0.68rem] font-black uppercase tracking-[0.12em] ${
                    wallet.id === activeWallet.id ? "text-cyan-300" : "text-slate-400"
                  }`}
                >
                  {PROFILE_KIND_DETAILS[wallet.profileKind].label}
                </div>
                <div
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                    wallet.id === activeWallet.id
                      ? "bg-white/15 text-white"
                      : MODEL_DETAILS[wallet.model].badge
                  }`}
                >
                  {MODEL_DETAILS[wallet.model].label}
                </div>
                <div
                  className={`mt-3 text-xs leading-5 ${
                    wallet.id === activeWallet.id ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {MODEL_DETAILS[wallet.model].description}
                </div>
                <div
                  className={`mt-3 font-mono text-[0.68rem] ${
                    wallet.id === activeWallet.id ? "text-slate-400" : "text-slate-400"
                  }`}
                >
                  {wallet.walletIdentifier}
                </div>
                </button>
              <div
                className={`mt-4 flex flex-wrap gap-2 border-t pt-3 ${
                  wallet.id === activeWallet.id ? "border-white/10" : "border-slate-100"
                }`}
              >
                {wallet.isCustom && (
                  <button
                    className={`text-xs font-black ${
                      wallet.id === activeWallet.id
                        ? "text-emerald-300 hover:text-emerald-200"
                        : "text-emerald-700 hover:text-emerald-900"
                    }`}
                    type="button"
                    onClick={() => openEditProfile(wallet)}
                  >
                    Edit
                  </button>
                )}
                <button
                  className={`text-xs font-black ${
                    wallet.id === activeWallet.id
                      ? "text-cyan-300 hover:text-cyan-200"
                      : "text-blue-700 hover:text-blue-900"
                  }`}
                  type="button"
                  onClick={() => cloneProfile(wallet)}
                >
                  Clone
                </button>
                <button
                  className={`text-xs font-black ${
                    wallet.id === activeWallet.id
                      ? "text-amber-300 hover:text-amber-200"
                      : "text-amber-700 hover:text-amber-900"
                  }`}
                  type="button"
                  aria-expanded={visibleWalletQrId === wallet.id}
                  onClick={() =>
                    setVisibleWalletQrId((current) =>
                      current === wallet.id ? "" : wallet.id
                    )
                  }
                >
                  {visibleWalletQrId === wallet.id
                    ? "Hide static QR"
                    : "Static receive QR"}
                </button>
                {wallet.isCustom && (
                  <button
                    className={`text-xs font-black ${
                      wallet.id === activeWallet.id
                        ? "text-rose-300 hover:text-rose-200"
                        : "text-rose-700 hover:text-rose-900"
                    }`}
                    type="button"
                    onClick={() => deleteProfile(wallet)}
                  >
                    Delete
                  </button>
                )}
              </div>
              {visibleWalletQrId === wallet.id && (
                <div
                  className={`mt-4 rounded-2xl p-4 ${
                    wallet.id === activeWallet.id ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  <SandboxQr
                    payload={`${window.location.origin}/pay?emv=${encodeURIComponent(
                      buildWalletEmvPayload(wallet)
                    )}`}
                    alt={`Reusable static payment QR for ${wallet.ownerName}`}
                    size={180}
                  />
                  <p className="mt-3 text-center text-xs font-black text-slate-700">
                    Reusable static receive QR
                  </p>
                  <p className="mt-1 text-center text-xs leading-5 text-slate-500">
                    No amount or payer is embedded. The payer enters the amount after scanning.
                  </p>
                </div>
              )}
              </article>
            ))}
          </div>
        )}
      </section>

      {showProfileEditor && (
        <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Custom wallet profile
              </div>
              <h2 className="mt-2 text-2xl font-black text-slate-950">
                {editingProfileId ? "Edit wallet profile" : "Create wallet profile"}
              </h2>
            </div>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600"
              type="button"
              onClick={() => setShowProfileEditor(false)}
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <ProfileInput
              label="Owner or display name"
              value={profileFields.ownerName}
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, ownerName: value }))
              }
            />
            <SelectField
              label="Profile type"
              value={profileFields.profileKind}
              onChange={(value) =>
                setProfileFields((current) => ({
                  ...current,
                  profileKind: value as ProfileKind,
                }))
              }
              options={Object.entries(PROFILE_KIND_DETAILS).map(([value, details]) => ({
                value,
                label: `${details.label} - ${details.description}`,
              }))}
            />
            <SelectField
              label="Funding model"
              value={profileFields.model}
              onChange={(value) =>
                setProfileFields((current) => ({
                  ...current,
                  model: value as FundingModel,
                  walletBalance: isBankOnlyModel(value as FundingModel)
                    ? "0.00"
                    : current.walletBalance,
                }))
              }
              options={Object.entries(MODEL_DETAILS).map(([value, details]) => ({
                value,
                label: details.label,
              }))}
            />
            <ProfileInput
              label="Opening stored-wallet balance (BBD)"
              value={profileFields.walletBalance}
              disabled={isBankOnlyModel(profileFields.model)}
              inputMode="decimal"
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, walletBalance: value }))
              }
            />
            <ProfileInput
              label="Opening linked-bank balance (BBD)"
              value={profileFields.bankBalance}
              inputMode="decimal"
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, bankBalance: value }))
              }
            />
            <ProfileInput
              label="Fictional bank name"
              value={profileFields.bankName}
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, bankName: value }))
              }
            />
            <ProfileInput
              label="Fictional account description"
              value={profileFields.bankDetail}
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, bankDetail: value }))
              }
            />
            <ProfileInput
              label="Wallet identifier"
              value={profileFields.walletIdentifier}
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, walletIdentifier: value }))
              }
            />
            <SelectField
              label="Profile color"
              value={profileFields.color}
              onChange={(value) =>
                setProfileFields((current) => ({ ...current, color: value }))
              }
              options={PROFILE_COLORS}
            />
          </div>

          <div className={`mt-6 rounded-2xl bg-gradient-to-r ${profileFields.color} p-4 text-white`}>
            <div className="text-xs font-black uppercase tracking-[0.15em] text-white/70">
              Profile preview
            </div>
            <div className="mt-2 text-xl font-black">
              {profileFields.ownerName.trim() || "Custom wallet"}
            </div>
            <div className="mt-1 text-sm text-white/80">
              {PROFILE_KIND_DETAILS[profileFields.profileKind].label} /{" "}
              {MODEL_DETAILS[profileFields.model].label} /{" "}
              {profileFields.walletIdentifier || "Wallet ID pending"}
            </div>
          </div>

          {profileMessage && (
            <div className="mt-5 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
              {profileMessage}
            </div>
          )}

          <button
            className="mt-5 rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
            type="button"
            onClick={saveProfile}
          >
            {editingProfileId ? "Save profile changes" : "Create wallet profile"}
          </button>
        </section>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <article className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl">
            <div className={`mb-6 h-2 rounded-full bg-gradient-to-r ${activeWallet.color}`} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                  Total spendable
                </div>
                <div className="mt-3 text-4xl font-black tracking-tight">
                  {formatMoney(totalAvailable)}
                </div>
                <div className="mt-2 text-sm text-slate-400">{activeWallet.ownerName}</div>
                <div className="mt-1 text-xs font-black uppercase tracking-wide text-cyan-300">
                  {PROFILE_KIND_DETAILS[activeWallet.profileKind].label}
                </div>
              </div>
              <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-white">
                {MODEL_DETAILS[activeWallet.model].shortLabel}
              </span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
              <BalanceValue label="Stored wallet" value={activeWallet.walletBalance} />
              <BalanceValue label="Linked bank" value={activeWallet.bankBalance} />
            </div>
            <div className="mt-5 text-xs text-slate-400">
              {activeWallet.fundingSources.length} linked account
              {activeWallet.fundingSources.length === 1 ? "" : "s"} /{" "}
              {activeWallet.bankName}
            </div>
            <div className="mt-2 font-mono text-xs text-slate-500">
              {activeWallet.walletIdentifier}
            </div>
          </article>

          <details className="group overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                  Static receive QR
                </div>
                <div className="mt-1 text-sm font-bold text-slate-600">
                  Reusable code for {activeWallet.ownerName}
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                <span className="group-open:hidden">Show QR +</span>
                <span className="hidden group-open:inline">Hide QR -</span>
              </span>
            </summary>
            <div className="border-t border-emerald-100 bg-emerald-50/40 px-6 py-6">
              <div className="mx-auto mb-5 flex max-w-xs rounded-xl bg-white p-1 shadow-sm">
                <button
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${
                    staticQrFormat === "link"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600"
                  }`}
                  type="button"
                  onClick={() => setStaticQrFormat("link")}
                >
                  Payment link
                </button>
                <button
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${
                    staticQrFormat === "emv"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600"
                  }`}
                  type="button"
                  onClick={() => setStaticQrFormat("emv")}
                >
                  Raw EMV QR
                </button>
              </div>
              <SandboxQr
                payload={activeWalletQrPayload}
                alt={`Reusable static payment QR for ${activeWallet.ownerName}`}
                size={220}
              />
              <div className="mx-auto mt-5 max-w-sm text-center">
                <div className="font-black text-slate-950">
                  Pay {activeWallet.ownerName}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {staticQrFormat === "link"
                    ? "This camera-friendly link opens the existing payment resolver with the EMV payload embedded."
                    : "This QR contains the raw EMV-style payload for compatible payment scanners."}{" "}
                  It is reusable and leaves the amount for the payer to enter.
                </p>
                <div className="mt-3 font-mono text-xs text-slate-500">
                  {activeWallet.walletIdentifier}
                </div>
                <Link
                  className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
                  to={`/experimental/scan?emv=${encodeURIComponent(activeWalletEmv)}`}
                >
                  Open this QR in scanner
                </Link>
              </div>
            </div>
          </details>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Funding behavior</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {MODEL_DETAILS[activeWallet.model].description}
            </p>
            {activeWallet.model === "hybrid" && (
              <div className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-800">
                A payment larger than the stored balance automatically splits into wallet and
                linked-bank ledger entries.
              </div>
            )}
          </article>

          <details className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <span className="text-lg font-black text-slate-950">
                Linked funding accounts
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {activeWallet.fundingSources.length} account
                {activeWallet.fundingSources.length === 1 ? "" : "s"}{" "}
                <span aria-hidden="true" className="ml-1 group-open:hidden">+</span>
                <span aria-hidden="true" className="ml-1 hidden group-open:inline">-</span>
              </span>
            </summary>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              One account is selected per transaction. Payments are never split silently across
              multiple bank accounts.
            </p>
            <div className="mt-4 space-y-3">
              {activeWallet.fundingSources.map((source) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={source.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-950">{source.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{source.detail}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-950">
                        {formatMoney(source.balance)}
                      </div>
                      {source.isDefault && (
                        <div className="mt-1 text-xs font-black uppercase text-emerald-700">
                          Default
                        </div>
                      )}
                    </div>
                  </div>
                  {activeWallet.isCustom && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!source.isDefault && (
                        <button
                          className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"
                          type="button"
                          onClick={() => setDefaultFundingSource(source.id)}
                        >
                          Make default
                        </button>
                      )}
                      <button
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
                        type="button"
                        onClick={() => removeFundingSource(source.id)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeWallet.isCustom && (
              <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                <ProfileInput
                  label="New account name"
                  value={newSourceName}
                  onChange={setNewSourceName}
                />
                <ProfileInput
                  label="Account description"
                  value={newSourceDetail}
                  onChange={setNewSourceDetail}
                />
                <ProfileInput
                  label="Opening balance (BBD)"
                  value={newSourceBalance}
                  inputMode="decimal"
                  onChange={setNewSourceBalance}
                />
                <button
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                  type="button"
                  onClick={addFundingSource}
                >
                  Add linked account
                </button>
              </div>
            )}
          </details>
        </div>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2">
            {!isBankOnlyModel(activeWallet.model) && (
              <ActionButton active={action === "reload"} onClick={() => switchAction("reload")}>
                Add money
              </ActionButton>
            )}
            <ActionButton active={action === "merchant"} onClick={() => switchAction("merchant")}>
              Pay merchant
            </ActionButton>
            <ActionButton active={action === "transfer"} onClick={() => switchAction("transfer")}>
              Send to wallet
            </ActionButton>
            <ActionButton active={action === "request"} onClick={() => switchAction("request")}>
              Request payment
            </ActionButton>
            {sharedSession && sharedSession.role !== "viewer" && (
              <ActionButton active={action === "adjust"} onClick={() => switchAction("adjust")}>
                Adjust balance
              </ActionButton>
            )}
          </div>

          <div className="mt-8">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              {action === "reload"
                ? "Move bank funds into stored value"
                : action === "merchant"
                  ? "Merchant payment"
                  : action === "transfer"
                    ? "Cross-model wallet transfer"
                    : action === "request"
                      ? "Request to pay (RTP)"
                      : "Explicit sandbox adjustment"}
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {action === "reload"
                ? `Reload ${activeWallet.ownerName}'s wallet`
                : action === "merchant"
                  ? "Choose a fictional merchant"
                  : action === "transfer"
                    ? "Choose any other wallet model"
                    : action === "request"
                      ? `Request money for ${activeWallet.ownerName}`
                      : `Adjust ${activeWallet.ownerName}'s recorded balance`}
            </h2>
          </div>

          <div className="mt-6 space-y-5">
            {(action === "reload" ||
              ((action === "merchant" || action === "transfer") &&
                activeWallet.model !== "prepaid") ||
              (action === "adjust" && adjustmentBalanceType === "bank")) && (
              <SelectField
                label="Linked funding account"
                value={selectedFundingSource?.id ?? ""}
                onChange={setFundingSourceId}
                options={activeWallet.fundingSources
                  .filter((source) => source.enabled)
                  .sort((left, right) => left.priority - right.priority)
                  .map((source) => ({
                    value: source.id,
                    label: `${source.name} - ${source.detail} (${formatMoney(source.balance)})${source.isDefault ? " - default" : ""}`,
                  }))}
              />
            )}
            {action === "merchant" && (
              <>
                <SelectField
                  label="Merchant"
                  value={merchantId}
                  onChange={setMerchantId}
                  options={MERCHANTS.map((merchant) => ({
                    value: merchant.id,
                    label: `${merchant.name} - ${merchant.location}`,
                  }))}
                />
                {selectedMerchant.settlementModel && (
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
                    <div className="font-black">
                      {selectedMerchant.settlementModel === "single-account"
                        ? "Shared chain settlement account"
                        : "Dedicated branch settlement account"}
                    </div>
                    <p className="mt-1 leading-6 text-cyan-800">
                      {selectedMerchant.settlementModel === "single-account"
                        ? `${selectedMerchant.merchantGroupName} uses account ${selectedMerchant.accountReference} for every branch. ${selectedMerchant.branchCode} remains the reconciliation label.`
                        : `${selectedMerchant.branchName} uses account ${selectedMerchant.accountReference}; its simulated balance is independent from the chain's other branches.`}
                    </p>
                  </div>
                )}
              </>
            )}
            {action === "transfer" && (
              <SelectField
                label="Recipient wallet"
                value={recipientWallet.id}
                onChange={setRecipientId}
                options={lab.wallets
                  .filter((wallet) => wallet.id !== activeWallet.id)
                  .map((wallet) => ({
                    value: wallet.id,
                    label: `${wallet.ownerName} - ${PROFILE_KIND_DETAILS[wallet.profileKind].label} / ${MODEL_DETAILS[wallet.model].label}`,
                  }))}
              />
            )}
            {action === "request" && (
              <>
                <SelectField
                  label="Requested payer wallet"
                  value={rtpPayer.id}
                  onChange={selectRtpPayer}
                  options={lab.wallets
                    .filter((wallet) => wallet.id !== activeWallet.id)
                    .map((wallet) => ({
                      value: wallet.id,
                      label: `${wallet.ownerName} - ${MODEL_DETAILS[wallet.model].label}`,
                    }))}
                />
                {rtpPayer.model !== "prepaid" && (
                  <SelectField
                    label="Payer funding account for simulated approval"
                    value={selectedRtpFundingSource?.id ?? ""}
                    onChange={(value) => {
                      setRtpFundingSourceId(value);
                      setPaymentRequest(null);
                    }}
                    options={rtpPayer.fundingSources
                      .filter((source) => source.enabled)
                      .sort((left, right) => left.priority - right.priority)
                      .map((source) => ({
                        value: source.id,
                        label: `${source.name} - ${source.detail} (${formatMoney(source.balance)})${source.isDefault ? " - default" : ""}`,
                      }))}
                  />
                )}
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
                  Creating a request does not move money. The selected payer must explicitly
                  approve it before balances and ledger entries change.
                </div>
              </>
            )}
            {action === "adjust" && (
              <SelectField
                label="Balance to adjust"
                value={adjustmentBalanceType}
                onChange={(value) => setAdjustmentBalanceType(value as BalanceType)}
                options={[
                  { value: "wallet", label: "Stored wallet balance" },
                  { value: "bank", label: "Linked bank balance" },
                ]}
              />
            )}

            <label className="block">
              <span className="text-sm font-black text-slate-700">
                {action === "adjust" ? "Adjustment amount (BBD)" : "Amount (BBD)"}
              </span>
              <div className="mt-2 flex overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
                <span className="grid place-items-center bg-slate-50 px-4 font-black text-slate-500">
                  $
                </span>
                <input
                  className="min-w-0 flex-1 px-4 py-4 text-lg font-black text-slate-950 outline-none"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (action === "request") setPaymentRequest(null);
                  }}
                />
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              {[10, 25, 50, 100].map((quickAmount) => (
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700"
                  key={quickAmount}
                  type="button"
                  onClick={() => {
                    setAmount(quickAmount.toFixed(2));
                    if (action === "request") setPaymentRequest(null);
                  }}
                >
                  ${quickAmount}
                </button>
              ))}
            </div>

            {action !== "reload" && (
              <label className="block">
                <span className="text-sm font-black text-slate-700">Note (optional)</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                  maxLength={60}
                  placeholder={
                    action === "merchant"
                      ? "Order reference"
                      : action === "adjust"
                        ? "Reason for this sandbox adjustment"
                        : "What is this for?"
                  }
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (action === "request") setPaymentRequest(null);
                  }}
                />
              </label>
            )}

            {action === "request" && paymentRequest && (
              <div className="rounded-[1.5rem] border border-violet-200 bg-violet-50 p-5">
                <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <SandboxQr
                    payload={`${window.location.origin}/pay?emv=${encodeURIComponent(
                      buildRtpEmvPayload(paymentRequest, activeWallet)
                    )}`}
                    alt={`Payment request QR from ${activeWallet.ownerName}`}
                    size={180}
                  />
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                      {paymentRequest.status === "paid" ? "Paid request" : "RTP ready to scan"}
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-950">
                      {formatMoney(paymentRequest.amount)}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {rtpPayer.ownerName} is being asked to pay {activeWallet.ownerName}.
                      The QR contains sandbox wallet identifiers, the amount, and the request
                      reference.
                    </p>
                    <div className="mt-3 font-mono text-xs text-slate-500">
                      RTP-{paymentRequest.id.slice(0, 8).toUpperCase()}
                    </div>
                    {paymentRequest.status === "pending" && (
                      <button
                        className="mt-4 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:opacity-50"
                        type="button"
                        disabled={transactionBusy || sharedSession?.role === "viewer"}
                        onClick={() => void approvePaymentRequest()}
                      >
                        {transactionBusy
                          ? "Approving atomically..."
                          : `Simulate approval by ${rtpPayer.ownerName}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              className="w-full rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-black text-white transition hover:bg-emerald-800"
              type="button"
              disabled={transactionBusy || sharedSession?.role === "viewer"}
              onClick={() =>
                action === "request"
                  ? createPaymentRequest()
                  : void submitTransaction()
              }
            >
              {transactionBusy
                ? "Processing atomically..."
                : action === "reload"
                ? "Move bank funds to wallet"
                : action === "merchant"
                  ? `Pay with ${MODEL_DETAILS[activeWallet.model].shortLabel.toLowerCase()} funding`
                  : action === "transfer"
                    ? "Transfer between wallet models"
                    : action === "request"
                      ? paymentRequest
                        ? "Regenerate request QR"
                        : "Create request-to-pay QR"
                      : "Apply atomic balance adjustment"}
            </button>

            {message && (
              <div
                className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
                role="status"
              >
                {message}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              {activeWallet.ownerName}&apos;s activity
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Wallet and bank movements are recorded separately in this browser-local ledger.
            </p>
          </div>
          <button
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
            type="button"
            onClick={resetLab}
          >
            Reset all models
          </button>
        </div>

        <div className="mt-6 divide-y divide-slate-100">
          {activeLedger.map((entry) => (
            <div className="flex items-center gap-4 py-4" key={entry.id}>
              <div
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-black ${
                  entry.amount >= 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {entry.amount >= 0 ? "+" : "-"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-slate-950">{entry.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide ${
                      entry.balanceType === "wallet"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {entry.balanceType}
                  </span>
                </div>
                <div className="truncate text-sm text-slate-500">{entry.detail}</div>
                <div className="mt-1 font-mono text-xs text-slate-400">
                  {entry.reference} / {new Date(entry.createdAt).toLocaleString()}
                </div>
              </div>
              <div
                className={`font-black ${
                  entry.amount >= 0 ? "text-emerald-700" : "text-slate-950"
                }`}
              >
                {entry.amount >= 0 ? "+" : "-"}
                {formatMoney(Math.abs(entry.amount))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function ActionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 font-bold text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BalanceValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{formatMoney(value)}</div>
    </div>
  );
}

/**
 * Renders a QR from an in-memory sandbox payload. Generation stays client-side,
 * so displaying a wallet QR does not publish profile data or create a payment.
 */
function SandboxQr({
  payload,
  alt,
  size,
}: {
  payload: string;
  alt: string;
  size: number;
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return dataUrl ? (
    <img
      className="mx-auto rounded-xl bg-white"
      src={dataUrl}
      width={size}
      height={size}
      alt={alt}
    />
  ) : (
    <div
      className="mx-auto grid animate-pulse place-items-center rounded-xl bg-slate-200 text-xs font-bold text-slate-500"
      style={{ width: size, height: size }}
      role="status"
    >
      Generating QR...
    </div>
  );
}

function ProfileInput({
  label,
  value,
  disabled = false,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  inputMode?: "decimal";
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 font-bold text-slate-950 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        disabled={disabled}
        inputMode={inputMode}
        maxLength={60}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

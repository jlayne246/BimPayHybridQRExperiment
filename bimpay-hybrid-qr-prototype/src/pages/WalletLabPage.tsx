import { useMemo, useRef, useState } from "react";
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

type WalletAction = "reload" | "merchant" | "transfer" | "adjust";

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
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileFields, setProfileFields] =
    useState<WalletProfileFields>(DEFAULT_PROFILE_FIELDS);
  const [profileMessage, setProfileMessage] = useState("");
  const [sharedSession, setSharedSession] = useState<SharedWorkspaceSession | null>(null);
  const [transactionBusy, setTransactionBusy] = useState(false);
  const [adjustmentBalanceType, setAdjustmentBalanceType] =
    useState<BalanceType>("wallet");
  const [fundingSourceId, setFundingSourceId] = useState("");
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
  const activeLedger = useMemo(
    () => lab.ledger.filter((entry) => entry.ownerId === activeWallet.id),
    [activeWallet.id, lab.ledger]
  );
  const selectedFundingSource =
    activeWallet.fundingSources.find((source) => source.id === fundingSourceId) ??
    defaultFundingSource(activeWallet);
  const totalAvailable =
    activeWallet.model === "prepaid"
      ? activeWallet.walletBalance
      : isBankOnlyModel(activeWallet.model)
        ? activeWallet.bankBalance
        : activeWallet.walletBalance + activeWallet.bankBalance;

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

    setActiveWalletId(walletId);
    setFundingSourceId(defaultFundingSource(nextWallet)?.id ?? "");
    setRecipientId(lab.wallets.find((wallet) => wallet.id !== walletId)?.id ?? walletId);
    setAction(isBankOnlyModel(nextWallet.model) ? "merchant" : "reload");
    setAmount(isBankOnlyModel(nextWallet.model) ? "12.50" : "25.00");
    setMessage("");
    setNote("");
  }

  function switchAction(nextAction: WalletAction): void {
    setAction(nextAction);
    setAmount(nextAction === "reload" ? "25.00" : "12.50");
    setMessage("");
    setNote("");
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
            setActiveWalletId(firstWallet.id);
            setRecipientId(
              sharedState.wallets.find((wallet) => wallet.id !== firstWallet.id)?.id ??
                firstWallet.id
            );
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
          <button
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
            type="button"
            onClick={openNewProfile}
          >
            Create custom wallet
          </button>
        </div>
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
            </article>
          ))}
        </div>
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

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Linked funding accounts</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
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
          </article>
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
                    : "Explicit sandbox adjustment"}
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {action === "reload"
                ? `Reload ${activeWallet.ownerName}'s wallet`
                : action === "merchant"
                  ? "Choose a fictional merchant"
                  : action === "transfer"
                    ? "Choose any other wallet model"
                    : `Adjust ${activeWallet.ownerName}'s recorded balance`}
            </h2>
          </div>

          <div className="mt-6 space-y-5">
            {(action === "reload" ||
              (action !== "adjust" && activeWallet.model !== "prepaid") ||
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
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              {[10, 25, 50, 100].map((quickAmount) => (
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700"
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount.toFixed(2))}
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
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}

            <button
              className="w-full rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-black text-white transition hover:bg-emerald-800"
              type="button"
              disabled={transactionBusy || sharedSession?.role === "viewer"}
              onClick={() => void submitTransaction()}
            >
              {transactionBusy
                ? "Processing atomically..."
                : action === "reload"
                ? "Move bank funds to wallet"
                : action === "merchant"
                  ? `Pay with ${MODEL_DETAILS[activeWallet.model].shortLabel.toLowerCase()} funding`
                  : action === "transfer"
                    ? "Transfer between wallet models"
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

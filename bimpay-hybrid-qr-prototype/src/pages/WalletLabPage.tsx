import { useMemo, useState } from "react";
import { ExperimentalWarning } from "../components/ExperimentalWarning";
import { WalletCollaborationPanel } from "../components/WalletCollaborationPanel";
import { MERCHANTS, PEOPLE } from "../data/sampleProfiles";
import type {
  BalanceType,
  FundingModel,
  LedgerEntry,
  SimulatedWallet,
  WalletLabState,
} from "../types/wallet";

type WalletAction = "reload" | "merchant" | "transfer";

interface WalletProfileFields {
  ownerName: string;
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
};

function createInitialState(): WalletLabState {
  const now = new Date().toISOString();
  return {
    wallets: [
      {
        id: PEOPLE[0].id,
        ownerName: PEOPLE[0].name,
        model: "prepaid",
        walletBalance: 150,
        bankBalance: 850,
        bankName: "Test Bank Account",
        bankDetail: "Checking ending 1184",
        walletIdentifier: "WLT-TEST-8842-1905",
        color: "from-emerald-700 to-teal-600",
        isCustom: false,
      },
      {
        id: PEOPLE[1].id,
        ownerName: PEOPLE[1].name,
        model: "bank-linked",
        walletBalance: 0,
        bankBalance: 620,
        bankName: "Island Credit Union",
        bankDetail: "Savings ending 4072",
        walletIdentifier: "WLT-TEST-4072-2210",
        color: "from-blue-700 to-indigo-600",
        isCustom: false,
      },
      {
        id: PEOPLE[2].id,
        ownerName: PEOPLE[2].name,
        model: "hybrid",
        walletBalance: 45,
        bankBalance: 475,
        bankName: "Test Route Bank",
        bankDetail: "Checking ending 9031",
        walletIdentifier: "WLT-TEST-9031-7714",
        color: "from-violet-700 to-fuchsia-600",
        isCustom: false,
      },
    ],
    ledger: [
      {
        id: "opening-maya",
        ownerId: PEOPLE[0].id,
        title: "Opening wallet balance",
        detail: "Preloaded test value",
        amount: 150,
        balanceType: "wallet",
        createdAt: now,
        reference: "WALLET-OPEN",
      },
      {
        id: "opening-andre",
        ownerId: PEOPLE[1].id,
        title: "Linked bank balance",
        detail: "Available through direct bank funding",
        amount: 620,
        balanceType: "bank",
        createdAt: now,
        reference: "BANK-OPEN",
      },
      {
        id: "opening-leah-wallet",
        ownerId: PEOPLE[2].id,
        title: "Opening wallet balance",
        detail: "Hybrid stored value",
        amount: 45,
        balanceType: "wallet",
        createdAt: now,
        reference: "HYBRID-OPEN",
      },
      {
        id: "opening-leah-bank",
        ownerId: PEOPLE[2].id,
        title: "Linked bank balance",
        detail: "Hybrid fallback funding",
        amount: 475,
        balanceType: "bank",
        createdAt: now,
        reference: "BANK-OPEN",
      },
    ],
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
    return {
      wallets: parsed.wallets.map((wallet, index) => ({
        ...wallet,
        walletIdentifier:
          wallet.walletIdentifier || `WLT-TEST-${String(index + 1).padStart(4, "0")}`,
        color: wallet.color || PROFILE_COLORS[index % PROFILE_COLORS.length].value,
        isCustom: wallet.isCustom === true,
      })),
      ledger: parsed.ledger,
    };
  } catch {
    return createInitialState();
  }
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
  const totalAvailable =
    activeWallet.model === "prepaid"
      ? activeWallet.walletBalance
      : activeWallet.model === "bank-linked"
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
    if (profileFields.model === "bank-linked" && walletBalance !== 0) {
      setProfileMessage("A bank-linked profile cannot begin with stored wallet value.");
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
      model: profileFields.model,
      walletBalance: balances.walletBalance,
      bankBalance: balances.bankBalance,
      bankName: profileFields.bankName.trim().slice(0, 60) || "Test Bank",
      bankDetail: profileFields.bankDetail.trim().slice(0, 60) || "Test account",
      walletIdentifier: profileFields.walletIdentifier.trim().slice(0, 40),
      color: profileFields.color,
      isCustom: true,
    };
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
    setAction(wallet.model === "bank-linked" ? "merchant" : "reload");
  }

  function cloneProfile(wallet: SimulatedWallet): void {
    setEditingProfileId("");
    setProfileFields({
      ownerName: `${wallet.ownerName} Copy`,
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
      setAction(fallbackWallet.model === "bank-linked" ? "merchant" : "reload");
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
    setRecipientId(lab.wallets.find((wallet) => wallet.id !== walletId)?.id ?? walletId);
    setAction(nextWallet.model === "bank-linked" ? "merchant" : "reload");
    setAmount(nextWallet.model === "bank-linked" ? "12.50" : "25.00");
    setMessage("");
    setNote("");
  }

  function switchAction(nextAction: WalletAction): void {
    setAction(nextAction);
    setAmount(nextAction === "reload" ? "25.00" : "12.50");
    setMessage("");
    setNote("");
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

  function fundPayment(
    wallet: SimulatedWallet,
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

    if (wallet.model === "bank-linked") {
      if (paymentAmount > wallet.bankBalance) return null;
      return {
        wallet: {
          ...wallet,
          bankBalance: roundMoney(wallet.bankBalance - paymentAmount),
        },
        entries: [
          addEntry(wallet.id, title, detail, -paymentAmount, "bank", reference),
        ],
        fundingDescription: "linked bank account",
      };
    }

    if (paymentAmount > wallet.walletBalance + wallet.bankBalance) return null;
    const walletPortion = Math.min(paymentAmount, wallet.walletBalance);
    const bankPortion = roundMoney(paymentAmount - walletPortion);
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
          `${detail} / bank fallback`,
          -bankPortion,
          "bank",
          reference
        )
      );
    }
    return {
      wallet: {
        ...wallet,
        walletBalance: roundMoney(wallet.walletBalance - walletPortion),
        bankBalance: roundMoney(wallet.bankBalance - bankPortion),
      },
      entries,
      fundingDescription:
        bankPortion > 0 && walletPortion > 0
          ? "wallet value plus bank fallback"
          : bankPortion > 0
            ? "linked bank fallback"
            : "stored wallet value",
    };
  }

  function submitTransaction(): void {
    const numericAmount = Number(amount);
    const transactionAmount = roundMoney(numericAmount);
    if (!Number.isFinite(numericAmount) || transactionAmount <= 0 || transactionAmount > 5000) {
      setMessage("Enter an amount from $0.01 to $5,000.00 BBD.");
      return;
    }

    if (action === "reload") {
      if (activeWallet.model === "bank-linked") {
        setMessage("A bank-linked wallet has no stored-value balance to reload.");
        return;
      }
      if (transactionAmount > activeWallet.bankBalance) {
        setMessage("The linked test bank account does not have enough available funds.");
        return;
      }

      const reference = makeReference("TOPUP");
      const updatedWallet: SimulatedWallet = {
        ...activeWallet,
        walletBalance: roundMoney(activeWallet.walletBalance + transactionAmount),
        bankBalance: roundMoney(activeWallet.bankBalance - transactionAmount),
      };
      persist({
        wallets: updateWallet(lab.wallets, activeWallet.id, updatedWallet),
        ledger: [
          addEntry(
            activeWallet.id,
            "Wallet reloaded",
            `${activeWallet.bankName} / ${activeWallet.bankDetail}`,
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
        recipientWallet.model === "bank-linked" ? "bank" : "wallet";
      const recipientUpdates =
        recipientBalanceType === "bank"
          ? { bankBalance: roundMoney(recipientWallet.bankBalance + transactionAmount) }
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
            Compare prepaid, bank-linked, and hybrid FinTech wallet behavior. Each model can pay
            merchants or transfer to another model while its wallet and bank balances update
            independently.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <ExperimentalWarning />
      </div>

      <WalletCollaborationPanel
        state={lab}
        onLoad={(sharedState) => {
          persist(sharedState);
          const firstWallet = sharedState.wallets[0];
          if (firstWallet) {
            setActiveWalletId(firstWallet.id);
            setRecipientId(
              sharedState.wallets.find((wallet) => wallet.id !== firstWallet.id)?.id ??
                firstWallet.id
            );
            setAction(firstWallet.model === "bank-linked" ? "merchant" : "reload");
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
              label="Funding model"
              value={profileFields.model}
              onChange={(value) =>
                setProfileFields((current) => ({
                  ...current,
                  model: value as FundingModel,
                  walletBalance: value === "bank-linked" ? "0.00" : current.walletBalance,
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
              disabled={profileFields.model === "bank-linked"}
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
              {activeWallet.bankName} / {activeWallet.bankDetail}
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
        </div>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2">
            {activeWallet.model !== "bank-linked" && (
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
          </div>

          <div className="mt-8">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              {action === "reload"
                ? "Move bank funds into stored value"
                : action === "merchant"
                  ? "Merchant payment"
                  : "Cross-model wallet transfer"}
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {action === "reload"
                ? `Reload ${activeWallet.ownerName}'s wallet`
                : action === "merchant"
                  ? "Choose a fictional merchant"
                  : "Choose any other wallet model"}
            </h2>
          </div>

          <div className="mt-6 space-y-5">
            {action === "merchant" && (
              <SelectField
                label="Merchant"
                value={merchantId}
                onChange={setMerchantId}
                options={MERCHANTS.map((merchant) => ({
                  value: merchant.id,
                  label: `${merchant.name} - ${merchant.location}`,
                }))}
              />
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
                    label: `${wallet.ownerName} - ${MODEL_DETAILS[wallet.model].label}`,
                  }))}
              />
            )}

            <label className="block">
              <span className="text-sm font-black text-slate-700">Amount (BBD)</span>
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
                  placeholder={action === "merchant" ? "Order reference" : "What is this for?"}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}

            <button
              className="w-full rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-black text-white transition hover:bg-emerald-800"
              type="button"
              onClick={submitTransaction}
            >
              {action === "reload"
                ? "Move bank funds to wallet"
                : action === "merchant"
                  ? `Pay with ${MODEL_DETAILS[activeWallet.model].shortLabel.toLowerCase()} funding`
                  : "Transfer between wallet models"}
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

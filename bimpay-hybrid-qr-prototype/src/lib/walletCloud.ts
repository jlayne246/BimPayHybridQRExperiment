import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  LedgerEntry,
  SimulatedWallet,
  WalletFundingSource,
  WalletLabState,
} from "../types/wallet";

export interface SharedWorkspace {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  updatedAt: string;
  revision: number;
}

export interface SharedWalletSnapshot {
  state: WalletLabState;
  revision: number;
}

export interface SharedWorkspaceSession {
  workspaceId: string;
  role: SharedWorkspace["role"];
  revision: number;
}

export interface AtomicWalletResult {
  revision: number;
  amount: number;
  fundingDescription?: string;
  recipientBalanceType?: "wallet" | "bank";
  balanceType?: "wallet" | "bank";
  resultingBalance?: number;
}

export interface SharedWorkspaceMember {
  userId: string;
  email: string;
  role: SharedWorkspace["role"];
}

interface WorkspaceMembershipRow {
  role: SharedWorkspace["role"];
  workspaces:
    | { id: string; name: string; updated_at: string; revision: number }
    | Array<{ id: string; name: string; updated_at: string; revision: number }>
    | null;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getCloudUser(): Promise<User | null> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  return data.user;
}

export async function sendMagicLink(email: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function listSharedWorkspaces(): Promise<SharedWorkspace[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_members")
    .select("role, workspaces!inner(id, name, updated_at, revision)")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as WorkspaceMembershipRow[]).flatMap((membership) => {
    const workspace = Array.isArray(membership.workspaces)
      ? membership.workspaces[0]
      : membership.workspaces;
    return workspace
      ? [
          {
            id: workspace.id,
            name: workspace.name,
            role: membership.role,
            updatedAt: workspace.updated_at,
            revision: Number(workspace.revision),
          },
        ]
      : [];
  });
}

export async function createSharedWorkspace(name: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("create_sandbox_workspace", {
    workspace_name: name,
  });
  if (error) throw error;
  return String(data);
}

export async function listSharedWorkspaceMembers(
  workspaceId: string
): Promise<SharedWorkspaceMember[]> {
  const { data, error } = await requireSupabase().rpc("list_workspace_members", {
    target_workspace_id: workspaceId,
  });
  if (error) throw error;
  return (data ?? []).map(
    (member: { user_id: string; email: string; role: SharedWorkspace["role"] }) => ({
      userId: member.user_id,
      email: member.email,
      role: member.role,
    })
  );
}

export async function addSharedWorkspaceMember(
  workspaceId: string,
  email: string,
  role: "editor" | "viewer"
): Promise<void> {
  const { error } = await requireSupabase().rpc("add_workspace_member_by_email", {
    target_workspace_id: workspaceId,
    member_email: email,
    member_role: role,
  });
  if (error) throw error;
}

export async function removeSharedWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  const { error } = await requireSupabase().rpc("remove_workspace_member", {
    target_workspace_id: workspaceId,
    member_user_id: userId,
  });
  if (error) throw error;
}

export async function loadSharedWalletState(
  workspaceId: string
): Promise<SharedWalletSnapshot> {
  const client = requireSupabase();
  const [workspaceResult, walletResult, fundingResult, ledgerResult] = await Promise.all([
    client.from("workspaces").select("revision").eq("id", workspaceId).single(),
    client
      .from("wallet_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("display_order", { ascending: true }),
    client
      .from("wallet_funding_sources")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: true }),
    client
      .from("ledger_entries")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (workspaceResult.error) throw workspaceResult.error;
  if (walletResult.error) throw walletResult.error;
  if (fundingResult.error) throw fundingResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const sourcesByProfile = new Map<string, WalletFundingSource[]>();
  for (const row of fundingResult.data ?? []) {
    const sources = sourcesByProfile.get(row.profile_id) ?? [];
    sources.push({
      id: row.source_id,
      name: row.source_name,
      detail: row.source_detail,
      balance: Number(row.balance),
      priority: Number(row.priority),
      isDefault: row.is_default,
      enabled: row.enabled,
    });
    sourcesByProfile.set(row.profile_id, sources);
  }
  const wallets: SimulatedWallet[] = (walletResult.data ?? []).map((row) => {
    const fundingSources = sourcesByProfile.get(row.profile_id) ?? [];
    return {
      id: row.profile_id,
      ownerName: row.owner_name,
      profileKind: row.profile_kind ?? "person",
      model: row.funding_model,
      walletBalance: Number(row.wallet_balance),
      bankBalance: fundingSources.reduce((total, source) => total + source.balance, 0),
      bankName: row.bank_name,
      bankDetail: row.bank_detail,
      fundingSources,
      walletIdentifier: row.wallet_identifier,
      color: row.color,
      isCustom: row.is_custom,
    };
  });
  const ledger: LedgerEntry[] = (ledgerResult.data ?? []).map((row) => ({
    id: row.entry_id,
    ownerId: row.owner_profile_id,
    title: row.title,
    detail: row.detail,
    amount: Number(row.amount),
    balanceType: row.balance_type,
    createdAt: row.created_at,
    reference: row.reference,
  }));
  if (wallets.length === 0) {
    throw new Error("This shared workspace does not contain wallet state yet.");
  }
  return {
    state: { wallets, ledger },
    revision: Number(workspaceResult.data.revision),
  };
}

export async function publishSharedWalletState(
  workspaceId: string,
  state: WalletLabState,
  expectedRevision: number
): Promise<number> {
  const { data, error } = await requireSupabase().rpc("replace_wallet_lab_state", {
    target_workspace_id: workspaceId,
    wallet_rows: state.wallets,
    ledger_rows: state.ledger,
    expected_revision: expectedRevision,
  });
  if (error) throw error;
  return Number(data);
}

function normalizeAtomicResult(data: Record<string, unknown>): AtomicWalletResult {
  return {
    revision: Number(data.revision),
    amount: Number(data.amount),
    fundingDescription:
      typeof data.fundingDescription === "string" ? data.fundingDescription : undefined,
    recipientBalanceType:
      data.recipientBalanceType === "wallet" || data.recipientBalanceType === "bank"
        ? data.recipientBalanceType
        : undefined,
    balanceType:
      data.balanceType === "wallet" || data.balanceType === "bank"
        ? data.balanceType
        : undefined,
    resultingBalance:
      data.resultingBalance === undefined ? undefined : Number(data.resultingBalance),
  };
}

export async function reloadSharedWallet(input: {
  workspaceId: string;
  profileId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
  fundingSourceId?: string;
}): Promise<AtomicWalletResult> {
  const { data, error } = await requireSupabase().rpc("reload_wallet_from_source", {
    target_workspace_id: input.workspaceId,
    target_profile_id: input.profileId,
    transaction_amount: input.amount,
    transaction_reference: input.reference,
    request_idempotency_key: input.idempotencyKey,
    target_source_id: input.fundingSourceId,
  });
  if (error) throw error;
  return normalizeAtomicResult(data as Record<string, unknown>);
}

export async function paySharedMerchant(input: {
  workspaceId: string;
  payerProfileId: string;
  amount: number;
  merchantName: string;
  detail: string;
  reference: string;
  idempotencyKey: string;
  fundingSourceId?: string;
}): Promise<AtomicWalletResult> {
  const { data, error } = await requireSupabase().rpc("pay_merchant_from_source", {
    target_workspace_id: input.workspaceId,
    payer_profile_id: input.payerProfileId,
    transaction_amount: input.amount,
    merchant_name: input.merchantName,
    transaction_detail: input.detail,
    transaction_reference: input.reference,
    request_idempotency_key: input.idempotencyKey,
    target_source_id: input.fundingSourceId,
  });
  if (error) throw error;
  return normalizeAtomicResult(data as Record<string, unknown>);
}

export async function transferSharedWallets(input: {
  workspaceId: string;
  payerProfileId: string;
  recipientProfileId: string;
  amount: number;
  detail: string;
  reference: string;
  idempotencyKey: string;
  fundingSourceId?: string;
}): Promise<AtomicWalletResult> {
  const { data, error } = await requireSupabase().rpc("transfer_between_wallets_from_source", {
    target_workspace_id: input.workspaceId,
    payer_profile_id: input.payerProfileId,
    recipient_profile_id: input.recipientProfileId,
    transaction_amount: input.amount,
    transaction_detail: input.detail,
    transaction_reference: input.reference,
    request_idempotency_key: input.idempotencyKey,
    target_source_id: input.fundingSourceId,
  });
  if (error) throw error;
  return normalizeAtomicResult(data as Record<string, unknown>);
}

export async function adjustSharedBalance(input: {
  workspaceId: string;
  profileId: string;
  balanceType: "wallet" | "bank";
  amount: number;
  reason: string;
  reference: string;
  idempotencyKey: string;
  fundingSourceId?: string;
}): Promise<AtomicWalletResult> {
  const { data, error } = await requireSupabase().rpc("adjust_sandbox_balance_from_source", {
    target_workspace_id: input.workspaceId,
    target_profile_id: input.profileId,
    target_balance_type: input.balanceType,
    adjustment_amount: input.amount,
    adjustment_reason: input.reason,
    transaction_reference: input.reference,
    request_idempotency_key: input.idempotencyKey,
    target_source_id: input.fundingSourceId,
  });
  if (error) throw error;
  return normalizeAtomicResult(data as Record<string, unknown>);
}

export function subscribeToSharedWorkspace(
  workspaceId: string,
  onChange: (revision: number) => void
): RealtimeChannel {
  return requireSupabase()
    .channel(`wallet-workspace-${workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workspaces",
        filter: `id=eq.${workspaceId}`,
      },
      (payload) => {
        const nextRow = payload.new as { revision?: number };
        onChange(Number(nextRow.revision ?? 0));
      }
    )
    .subscribe();
}

export async function unsubscribeFromSharedWorkspace(
  channel: RealtimeChannel
): Promise<void> {
  await requireSupabase().removeChannel(channel);
}

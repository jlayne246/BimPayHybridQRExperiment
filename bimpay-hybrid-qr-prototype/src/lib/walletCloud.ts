import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { LedgerEntry, SimulatedWallet, WalletLabState } from "../types/wallet";

export interface SharedWorkspace {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  updatedAt: string;
}

export interface SharedWorkspaceMember {
  userId: string;
  email: string;
  role: SharedWorkspace["role"];
}

interface WorkspaceMembershipRow {
  role: SharedWorkspace["role"];
  workspaces:
    | { id: string; name: string; updated_at: string }
    | Array<{ id: string; name: string; updated_at: string }>
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
    .select("role, workspaces!inner(id, name, updated_at)")
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

export async function loadSharedWalletState(workspaceId: string): Promise<WalletLabState> {
  const client = requireSupabase();
  const [walletResult, ledgerResult] = await Promise.all([
    client
      .from("wallet_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("display_order", { ascending: true }),
    client
      .from("ledger_entries")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (walletResult.error) throw walletResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const wallets: SimulatedWallet[] = (walletResult.data ?? []).map((row) => ({
    id: row.profile_id,
    ownerName: row.owner_name,
    model: row.funding_model,
    walletBalance: Number(row.wallet_balance),
    bankBalance: Number(row.bank_balance),
    bankName: row.bank_name,
    bankDetail: row.bank_detail,
    walletIdentifier: row.wallet_identifier,
    color: row.color,
    isCustom: row.is_custom,
  }));
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
  return { wallets, ledger };
}

export async function publishSharedWalletState(
  workspaceId: string,
  state: WalletLabState
): Promise<void> {
  const { error } = await requireSupabase().rpc("replace_wallet_lab_state", {
    target_workspace_id: workspaceId,
    wallet_rows: state.wallets,
    ledger_rows: state.ledger,
  });
  if (error) throw error;
}

export function subscribeToSharedWorkspace(
  workspaceId: string,
  onChange: () => void
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
      onChange
    )
    .subscribe();
}

export async function unsubscribeFromSharedWorkspace(
  channel: RealtimeChannel
): Promise<void> {
  await requireSupabase().removeChannel(channel);
}

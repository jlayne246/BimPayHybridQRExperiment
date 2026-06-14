import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  addSharedWorkspaceMember,
  createSharedWorkspace,
  getCloudUser,
  listSharedWorkspaceMembers,
  listSharedWorkspaces,
  loadSharedWalletState,
  publishSharedWalletState,
  removeSharedWorkspaceMember,
  sendMagicLink,
  signOutCloud,
  subscribeToSharedWorkspace,
  unsubscribeFromSharedWorkspace,
} from "../lib/walletCloud";
import type { SharedWorkspace } from "../lib/walletCloud";
import type { SharedWorkspaceMember } from "../lib/walletCloud";
import type { SharedWorkspaceSession } from "../lib/walletCloud";
import type { WalletLabState } from "../types/wallet";

/**
 * Manages Supabase identity, workspace membership, and explicit wallet
 * snapshot load/publish actions. Atomic transactions are dispatched by the
 * Wallet Lab itself rather than through this configuration panel.
 */
export function WalletCollaborationPanel({
  state,
  onLoad,
  session,
  onSessionChange,
}: {
  state: WalletLabState;
  onLoad: (state: WalletLabState) => void;
  session: SharedWorkspaceSession | null;
  onSessionChange: (session: SharedWorkspaceSession | null) => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Wallet Sandbox");
  const [workspaces, setWorkspaces] = useState<SharedWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [members, setMembers] = useState<SharedWorkspaceMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"editor" | "viewer">("editor");
  const suppressNextRealtime = useRef(false);

  const refreshWorkspaces = useCallback(async () => {
    const nextWorkspaces = await listSharedWorkspaces();
    setWorkspaces(nextWorkspaces);
    setWorkspaceId((current) => current || nextWorkspaces[0]?.id || "");
  }, []);

  const refreshMembers = useCallback(async (selectedWorkspaceId: string) => {
    if (!selectedWorkspaceId) {
      setMembers([]);
      return;
    }
    setMembers(await listSharedWorkspaceMembers(selectedWorkspaceId));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;

    void getCloudUser()
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        if (nextUser) void refreshWorkspaces();
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        void refreshWorkspaces();
      } else {
        setWorkspaces([]);
        setWorkspaceId("");
        onSessionChange(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [onSessionChange, refreshWorkspaces]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    const channel = subscribeToSharedWorkspace(workspaceId, (revision) => {
      if (session?.workspaceId === workspaceId && revision <= session.revision) {
        return;
      }
      if (suppressNextRealtime.current) {
        suppressNextRealtime.current = false;
        return;
      }
      setRemoteChanged(true);
      setMessage("A collaborator published changes. Load the shared state when ready.");
    });
    const memberRefresh = window.setTimeout(() => {
      void refreshMembers(workspaceId);
    }, 0);
    return () => {
      window.clearTimeout(memberRefresh);
      void unsubscribeFromSharedWorkspace(channel);
    };
  }, [refreshMembers, session, user, workspaceId]);

  async function requestMagicLink(): Promise<void> {
    if (!email.trim()) {
      setMessage("Enter an invited collaborator email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await sendMagicLink(email.trim());
      setMessage("Magic link sent. Only users already invited in Supabase can sign in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the magic link.");
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(): Promise<void> {
    if (!workspaceName.trim()) {
      setMessage("Enter a shared workspace name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const id = await createSharedWorkspace(workspaceName.trim());
      const revision = await publishSharedWalletState(id, state, 0);
      await refreshWorkspaces();
      setWorkspaceId(id);
      onSessionChange({ workspaceId: id, role: "owner", revision });
      setRemoteChanged(false);
      setMessage("Shared workspace created from the current local wallet state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function loadWorkspace(): Promise<void> {
    if (!workspaceId) return;
    setBusy(true);
    setMessage("");
    try {
      const snapshot = await loadSharedWalletState(workspaceId);
      onLoad(snapshot.state);
      const selectedWorkspace = workspaces.find(
        (workspace) => workspace.id === workspaceId
      );
      if (!selectedWorkspace) throw new Error("Shared workspace access was not found.");
      onSessionChange({
        workspaceId,
        role: selectedWorkspace.role,
        revision: snapshot.revision,
      });
      setRemoteChanged(false);
      setMessage("Shared wallet state loaded into this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load shared state.");
    } finally {
      setBusy(false);
    }
  }

  async function publishWorkspace(): Promise<void> {
    if (!workspaceId || !session || session.workspaceId !== workspaceId) {
      setMessage("Load the shared workspace before publishing local changes.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      // Ignore the revision notification caused by this browser's own publish.
      suppressNextRealtime.current = true;
      const revision = await publishSharedWalletState(
        workspaceId,
        state,
        session.revision
      );
      onSessionChange({ ...session, revision });
      await refreshWorkspaces();
      setRemoteChanged(false);
      setMessage("Current local wallet state published to collaborators.");
    } catch (error) {
      suppressNextRealtime.current = false;
      setRemoteChanged(true);
      setMessage(
        error instanceof Error && error.message.includes("revision conflict")
          ? "A collaborator published first. Load the newer shared state before publishing again."
          : error instanceof Error
            ? error.message
            : "Could not publish shared state."
      );
    } finally {
      setBusy(false);
    }
  }

  async function addMember(): Promise<void> {
    if (!workspaceId || !memberEmail.trim()) {
      setMessage("Enter the email address of a user already invited to this Supabase project.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await addSharedWorkspaceMember(workspaceId, memberEmail.trim(), memberRole);
      await refreshMembers(workspaceId);
      setMemberEmail("");
      setMessage("Workspace membership updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the workspace member.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: SharedWorkspaceMember): Promise<void> {
    if (!workspaceId) return;
    setBusy(true);
    setMessage("");
    try {
      await removeSharedWorkspaceMember(workspaceId, member.userId);
      await refreshMembers(workspaceId);
      setMessage(`${member.email} was removed from this workspace.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the member.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true);
    try {
      await signOutCloud();
      onSessionChange(null);
      setMessage("Collaboration account signed out. The private site session remains active.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="mt-6 rounded-[2rem] border border-dashed border-slate-300 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Shared collaboration
        </div>
        <h2 className="mt-2 text-xl font-black text-slate-950">Local mode is active</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to enable invite-only
          shared workspaces. Local wallet profiles and transactions continue to work without them.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-[2rem] border border-cyan-200 bg-cyan-50/50 p-6 shadow-sm sm:p-8">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-800">
        Shared collaboration
      </div>
      {!user ? (
        <div className="mt-3 max-w-xl">
          <h2 className="text-xl font-black text-slate-950">Sign in as an invited collaborator</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This is separate from the site password and provides an individual identity for
            workspace permissions and auditability.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-700 focus:ring-4 focus:ring-cyan-100"
              type="email"
              autoComplete="email"
              placeholder="collaborator@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              className="rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              type="button"
              disabled={busy}
              onClick={() => void requestMagicLink()}
            >
              Send magic link
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Shared wallet workspaces</h2>
              <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}</p>
            </div>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600"
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Sign out of collaboration
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-950"
                value={workspaceId}
                onChange={(event) => {
                  setWorkspaceId(event.target.value);
                  setRemoteChanged(false);
                  onSessionChange(null);
                  setMembers([]);
                }}
              >
                <option value="">Choose a shared workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
              <button
                className="rounded-2xl border border-cyan-700 bg-white px-5 py-3 text-sm font-black text-cyan-800 disabled:opacity-50"
                type="button"
                disabled={busy || !workspaceId}
                onClick={() => void loadWorkspace()}
              >
                Load shared
              </button>
              <button
                className="rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                type="button"
                disabled={
                  busy ||
                  !workspaceId ||
                  !session ||
                  session.workspaceId !== workspaceId ||
                  workspaces.find((workspace) => workspace.id === workspaceId)?.role === "viewer"
                }
                onClick={() => void publishWorkspace()}
              >
                Publish local
              </button>
            </div>
            {remoteChanged && (
              <div className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-black text-amber-900">
                Shared state changed
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
            Each browser works on a local copy. Loading records the shared revision; publishing
            succeeds only if nobody else has published a newer revision. A conflict never silently
            overwrites another collaborator&apos;s balances.
          </div>

          <div className="mt-5 border-t border-cyan-200 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-700"
                maxLength={80}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
              <button
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                type="button"
                disabled={busy}
                onClick={() => void createWorkspace()}
              >
                Create shared workspace
              </button>
            </div>
          </div>

          {workspaces.find((workspace) => workspace.id === workspaceId)?.role === "owner" && (
            <div className="mt-5 border-t border-cyan-200 pt-5">
              <h3 className="font-black text-slate-950">Workspace members</h3>
              <p className="mt-1 text-sm text-slate-600">
                Invite the user through Supabase Auth first, then grant access here.
              </p>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3"
                  type="email"
                  placeholder="invited.user@example.com"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                />
                <select
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold"
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as "editor" | "viewer")}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                  type="button"
                  disabled={busy}
                  onClick={() => void addMember()}
                >
                  Add member
                </button>
              </div>
              <div className="mt-4 divide-y divide-cyan-100 rounded-2xl bg-white px-4">
                {members.map((member) => (
                  <div className="flex items-center gap-3 py-3" key={member.userId}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">
                        {member.email}
                      </div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                        {member.role}
                      </div>
                    </div>
                    {member.role !== "owner" && (
                      <button
                        className="text-sm font-black text-rose-700"
                        type="button"
                        disabled={busy}
                        onClick={() => void removeMember(member)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
          {message}
        </div>
      )}
    </section>
  );
}

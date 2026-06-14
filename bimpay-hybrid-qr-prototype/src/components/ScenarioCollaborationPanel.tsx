import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  getCloudUser,
  listSharedWorkspaces,
  sendMagicLink,
  signOutCloud,
  subscribeToSharedWorkspace,
  unsubscribeFromSharedWorkspace,
} from "../lib/walletCloud";
import type { SharedWorkspace, SharedWorkspaceSession } from "../lib/walletCloud";
import {
  loadSharedScenarioState,
  publishSharedScenarioState,
} from "../lib/scenarioCloud";
import type { ScenarioLabState } from "../types/scenario";

/**
 * Explicit load/publish controls for Scenario profiles and terminal history.
 *
 * This component reuses Wallet workspace membership and revision notifications,
 * but never reads or mutates wallet balances.
 */
export function ScenarioCollaborationPanel({
  state,
  onLoad,
}: {
  state: ScenarioLabState;
  onLoad: (state: ScenarioLabState) => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [workspaces, setWorkspaces] = useState<SharedWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [session, setSession] = useState<SharedWorkspaceSession | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const suppressNextRealtime = useRef(false);

  const refreshWorkspaces = useCallback(async () => {
    const nextWorkspaces = await listSharedWorkspaces();
    setWorkspaces(nextWorkspaces);
    setWorkspaceId((current) => current || nextWorkspaces[0]?.id || "");
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
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!active) return;
      setUser(authSession?.user ?? null);
      if (authSession?.user) {
        void refreshWorkspaces();
      } else {
        setWorkspaces([]);
        setWorkspaceId("");
        setSession(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    const channel = subscribeToSharedWorkspace(workspaceId, (revision) => {
      if (session?.workspaceId === workspaceId && revision <= session.revision) return;
      if (suppressNextRealtime.current) {
        suppressNextRealtime.current = false;
        return;
      }
      setRemoteChanged(true);
      setMessage("A collaborator published workspace changes. Load shared before publishing.");
    });
    return () => {
      void unsubscribeFromSharedWorkspace(channel);
    };
  }, [session, user, workspaceId]);

  async function requestMagicLink(): Promise<void> {
    if (!email.trim()) {
      setMessage("Enter an invited collaborator email address.");
      return;
    }
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setMessage("Magic link sent to the invited collaborator.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the magic link.");
    } finally {
      setBusy(false);
    }
  }

  async function loadWorkspace(): Promise<void> {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const snapshot = await loadSharedScenarioState(workspaceId);
      const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
      if (!workspace) throw new Error("Shared workspace access was not found.");
      setSession({
        workspaceId,
        role: workspace.role,
        revision: snapshot.revision,
      });
      // Preserve an editor's unpublished local work when initializing a workspace.
      const sharedIsEmpty =
        snapshot.state.customPeople.length === 0 &&
        snapshot.state.customMerchants.length === 0 &&
        snapshot.state.transactions.length === 0;
      const localHasData =
        state.customPeople.length > 0 ||
        state.customMerchants.length > 0 ||
        state.transactions.length > 0;
      if (sharedIsEmpty && localHasData && workspace.role !== "viewer") {
        setMessage(
          "This workspace has no shared scenario data yet. Local profiles and history were retained; publish to initialize it."
        );
      } else {
        onLoad(snapshot.state);
        setMessage("Shared scenario profiles and history loaded.");
      }
      setRemoteChanged(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load scenario state.");
    } finally {
      setBusy(false);
    }
  }

  async function publishWorkspace(): Promise<void> {
    if (!workspaceId || !session || session.workspaceId !== workspaceId) {
      setMessage("Load the workspace before publishing scenario changes.");
      return;
    }
    setBusy(true);
    try {
      suppressNextRealtime.current = true;
      const revision = await publishSharedScenarioState(
        workspaceId,
        state,
        session.revision
      );
      setSession({ ...session, revision });
      await refreshWorkspaces();
      setRemoteChanged(false);
      setMessage("Scenario profiles and history published to collaborators.");
    } catch (error) {
      suppressNextRealtime.current = false;
      setRemoteChanged(true);
      setMessage(
        error instanceof Error && error.message.includes("revision conflict")
          ? "A collaborator published first. Load shared before trying again."
          : error instanceof Error
            ? error.message
            : "Could not publish scenario state."
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true);
    try {
      await signOutCloud();
      setSession(null);
      setMessage("Collaboration account signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return null;

  return (
    <section className="mt-6 rounded-[2rem] border border-indigo-200 bg-indigo-50/60 p-6 shadow-sm sm:p-8">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-800">
        Shared scenario workspace
      </div>
      {!user ? (
        <div className="mt-3 max-w-xl">
          <h2 className="text-xl font-black text-slate-950">Sign in as a collaborator</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The same workspace membership used by the Wallet Lab grants access here.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3"
              type="email"
              placeholder="collaborator@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              className="rounded-2xl bg-indigo-800 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
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
              <h2 className="text-xl font-black text-slate-950">
                Shared profiles and scenario history
              </h2>
              <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}</p>
            </div>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold"
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Sign out of collaboration
            </button>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <select
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold"
              value={workspaceId}
              onChange={(event) => {
                setWorkspaceId(event.target.value);
                setSession(null);
                setRemoteChanged(false);
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
              className="rounded-2xl border border-indigo-700 bg-white px-5 py-3 text-sm font-black text-indigo-800 disabled:opacity-50"
              type="button"
              disabled={busy || !workspaceId}
              onClick={() => void loadWorkspace()}
            >
              Load shared
            </button>
            <button
              className="rounded-2xl bg-indigo-800 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              type="button"
              disabled={busy || !session || session.role === "viewer"}
              onClick={() => void publishWorkspace()}
            >
              Publish local
            </button>
          </div>
          <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
            Custom people, custom merchants, and simulated scenario history are shared. Wallet
            balances and wallet ledger entries remain in the Wallet Lab and are not changed by QR
            lifecycle simulations.
          </p>
          {remoteChanged && (
            <div className="mt-4 rounded-2xl bg-amber-100 p-3 text-sm font-black text-amber-900">
              Shared workspace changed
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

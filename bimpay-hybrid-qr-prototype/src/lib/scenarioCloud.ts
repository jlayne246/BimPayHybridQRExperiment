import { supabase } from "./supabase";
import type { ScenarioLabState } from "../types/scenario";

/** Scenario state plus the workspace revision against which it was read. */
export interface SharedScenarioSnapshot {
  state: ScenarioLabState;
  revision: number;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/** Loads custom Scenario profiles and terminal history for one authorized workspace. */
export async function loadSharedScenarioState(
  workspaceId: string
): Promise<SharedScenarioSnapshot> {
  const { data, error } = await requireSupabase().rpc("load_scenario_lab_state", {
    target_workspace_id: workspaceId,
  });
  if (error) throw error;

  const result = data as {
    revision: number;
    customPeople?: ScenarioLabState["customPeople"];
    customMerchants?: ScenarioLabState["customMerchants"];
    transactions?: ScenarioLabState["transactions"];
  };
  return {
    revision: Number(result.revision),
    state: {
      customPeople: result.customPeople ?? [],
      customMerchants: result.customMerchants ?? [],
      transactions: result.transactions ?? [],
    },
  };
}

/**
 * Replaces the workspace's Scenario bundle using optimistic concurrency.
 *
 * The database rejects the write if any Wallet or Scenario operation has
 * incremented the shared workspace revision since the caller loaded it.
 */
export async function publishSharedScenarioState(
  workspaceId: string,
  state: ScenarioLabState,
  expectedRevision: number
): Promise<number> {
  const { data, error } = await requireSupabase().rpc("replace_scenario_lab_state", {
    target_workspace_id: workspaceId,
    custom_people: state.customPeople,
    custom_merchants: state.customMerchants,
    transaction_rows: state.transactions,
    expected_revision: expectedRevision,
  });
  if (error) throw error;
  return Number(data);
}

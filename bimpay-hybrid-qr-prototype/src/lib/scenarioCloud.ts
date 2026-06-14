import { supabase } from "./supabase";
import type { ScenarioLabState } from "../types/scenario";

export interface SharedScenarioSnapshot {
  state: ScenarioLabState;
  revision: number;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

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

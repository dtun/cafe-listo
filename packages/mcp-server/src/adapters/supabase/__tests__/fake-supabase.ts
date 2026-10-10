import type { SupabaseClient } from "@supabase/supabase-js";

export interface RecordedCall {
  method: string;
  args: unknown[];
}

interface ScriptedResult {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

/**
 * Minimal chainable stand-in for the supabase-js query builder. Records every
 * call and resolves the chain (when awaited) to the scripted result.
 */
export function createFakeSupabase(result: ScriptedResult = {}) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "upsert", "delete"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: result.data ?? null, error: result.error ?? null });

  return { client: builder as unknown as SupabaseClient, calls };
}

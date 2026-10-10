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
 * call and resolves the chain (when awaited) to the scripted result. Pass an
 * array to script successive awaits; the last result repeats.
 */
export function createFakeSupabase(
  scripted: ScriptedResult | ScriptedResult[] = {},
) {
  const results = Array.isArray(scripted) ? [...scripted] : [scripted];
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "eq",
    "upsert",
    "insert",
    "delete",
    "lt",
    "maybeSingle",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => {
    const result = (results.length > 1 ? results.shift() : results[0]) ?? {};
    return resolve({ data: result.data ?? null, error: result.error ?? null });
  };

  return { client: builder as unknown as SupabaseClient, calls };
}

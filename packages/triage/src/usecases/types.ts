import type { Problem } from "../plan";

export type TriageErrorCode =
  /** The open issue list was shorter than the open count: dedupe would be blind. */
  | "incomplete_issues"
  /** The analyzer's output failed parsing or validation; nothing was filed. */
  | "invalid_plan"
  /** The saved pending plan no longer validates; a human must look. */
  | "invalid_pending"
  /** A create or comment failed partway; the next run resumes. */
  | "action_failed"
  /** A port failed before anything was filed. */
  | "dependency_failed"
  /** Another run holds the ledger's lock. */
  | "locked";

export interface TriageError {
  code: TriageErrorCode;
  message: string;
  problems?: Problem[];
}

export type UseCaseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TriageError };

export function ok<T>(data: T): UseCaseResult<T> {
  return { ok: true, data };
}

export function fail<T>(
  code: TriageErrorCode,
  message: string,
  problems?: Problem[],
): UseCaseResult<T> {
  return { ok: false, error: { code, message, ...(problems && { problems }) } };
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface IdGenerator {
  next(): string;
}

export const randomIds: IdGenerator = { next: () => crypto.randomUUID() };

import type { Category, PrepItem } from "@cafe-listo/shared";

export type UseCaseErrorCode =
  | "not_found"
  | "forbidden"
  | "unprocessable"
  | "conflict";

export type UseCaseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: UseCaseErrorCode; message: string } };

export function ok<T>(data: T): UseCaseResult<T> {
  return { ok: true, data };
}

export function fail<T>(
  code: UseCaseErrorCode,
  message: string,
): UseCaseResult<T> {
  return { ok: false, error: { code, message } };
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface IdGenerator {
  next(): string;
}

export const randomUuids: IdGenerator = { next: () => crypto.randomUUID() };

export interface Catalog {
  categories: readonly Category[];
  items: readonly PrepItem[];
}

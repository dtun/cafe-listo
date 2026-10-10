import type { IdGenerator } from "../../usecases/types";

export function sequentialIds(
  prefix = "00000000-0000-4000-8000-",
): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}${String(++n).padStart(12, "0")}` };
}

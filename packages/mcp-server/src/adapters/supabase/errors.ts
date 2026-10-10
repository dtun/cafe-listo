import { ConflictError, RepositoryError } from "@cafe-listo/shared";

interface PostgrestLikeError {
  code?: string;
  message: string;
}

const UNIQUE_VIOLATION = "23505";

export function toRepositoryError(error: PostgrestLikeError): RepositoryError {
  if (error.code === UNIQUE_VIOLATION) return new ConflictError(error.message);
  return new RepositoryError("QUERY_FAILED", error.message);
}

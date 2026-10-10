type Fields = Record<string, unknown>;

/** Structured JSON log lines. Info goes to stdout; Railway tags anything on stderr as an error. */
export function logInfo(message: string, fields: Fields = {}): void {
  process.stdout.write(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      message,
      ...fields,
    }) + "\n",
  );
}

export function logError(message: string, fields: Fields = {}): void {
  process.stderr.write(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      message,
      ...fields,
    }) + "\n",
  );
}

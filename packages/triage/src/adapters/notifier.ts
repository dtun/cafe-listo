import type { Exec } from "./exec";

export interface Notifier {
  notify(message: string): Promise<void>;
}

export const silentNotifier: Notifier = { notify: async () => {} };

/**
 * macOS notification through osascript. The message travels as an argv item,
 * never inside the script text. Best effort: failures are ignored.
 */
export class MacNotifier implements Notifier {
  constructor(private readonly exec: Exec) {}

  async notify(message: string): Promise<void> {
    try {
      await this.exec({
        file: "osascript",
        args: [
          "-e",
          "on run argv",
          "-e",
          'display notification (item 1 of argv) with title "Café Listo triage"',
          "-e",
          "end run",
          message,
        ],
        timeoutMs: 10_000,
      });
    } catch {
      // No notification centre (headless, Linux, CI): the printed report is enough.
    }
  }
}

export function notifierFor(platform: string, exec: Exec): Notifier {
  return platform === "darwin" ? new MacNotifier(exec) : silentNotifier;
}

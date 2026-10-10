import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ClaudePlanAnalyzer } from "./adapters/claude-plan-analyzer";
import { nodeExec, type Exec } from "./adapters/exec";
import { FileTriageLedger } from "./adapters/file-triage-ledger";
import { GhIssueTracker } from "./adapters/gh-issue-tracker";
import { notifierFor, type Notifier } from "./adapters/notifier";
import { SupabaseFeedbackReader } from "./adapters/supabase-feedback-reader";
import { DEFAULT_POLICY, type TriagePolicy } from "./plan";
import type {
  FeedbackReader,
  IssueTracker,
  PlanAnalyzer,
  TriageLedger,
} from "./ports";
import instructions from "./prompt.md";
import { TriageFeedback } from "./usecases/triage-feedback";
import { systemClock, type Clock } from "./usecases/types";

export interface TriageConfig {
  stateDir: string;
  /** The main checkout, linked to the Supabase project (`supabase link`). */
  repoDir: string;
  githubRepo: string;
  trustedAuthors: string[];
}

/** Reads config from the environment. Throws with a fix-it message when unusable. */
export function loadConfig(
  env: Record<string, string | undefined>,
  home = homedir(),
): TriageConfig {
  const repoDir = env.REPO_DIR?.trim();
  if (!repoDir) {
    throw new Error(
      "REPO_DIR is not set; point it at the main cafe-listo checkout",
    );
  }
  const resolvedRepo = resolve(repoDir);
  if (!existsSync(join(resolvedRepo, "supabase/.temp/project-ref"))) {
    throw new Error(
      `no linked Supabase project in REPO_DIR=${resolvedRepo}; run \`supabase link\` there first`,
    );
  }
  const trustedAuthors = (env.TRIAGE_TRUSTED_AUTHORS ?? "dtun")
    .split(",")
    .map((login) => login.trim())
    .filter(Boolean);
  return {
    stateDir: resolve(
      env.TRIAGE_STATE_DIR?.trim() || join(home, ".cafe-listo/triage"),
    ),
    repoDir: resolvedRepo,
    githubRepo: env.GITHUB_REPO?.trim() || "dtun/cafe-listo",
    trustedAuthors,
  };
}

export interface ContainerDeps {
  reader: FeedbackReader;
  tracker: IssueTracker;
  analyzer: PlanAnalyzer;
  ledger: TriageLedger;
}

export interface ContainerOverrides {
  clock?: Clock;
  policy?: TriagePolicy;
}

export interface UseCases {
  triageFeedback: TriageFeedback;
}

/** Composition root: wires adapters into the use case. No DI library. */
export function buildContainer(
  deps: ContainerDeps,
  overrides: ContainerOverrides = {},
): UseCases {
  return Object.freeze({
    triageFeedback: new TriageFeedback({
      ...deps,
      clock: overrides.clock ?? systemClock,
      policy: overrides.policy ?? DEFAULT_POLICY,
    }),
  });
}

export interface CliRuntime {
  exec?: Exec;
  clock?: Clock;
  platform?: string;
}

/** The production wiring: supabase, gh and claude CLIs plus a file ledger. */
export function cliContainer(
  config: TriageConfig,
  runtime: CliRuntime = {},
): UseCases & { notifier: Notifier } {
  const exec = runtime.exec ?? nodeExec;
  const container = buildContainer(
    {
      reader: new SupabaseFeedbackReader(exec, config.repoDir),
      tracker: new GhIssueTracker(exec, config.githubRepo),
      analyzer: new ClaudePlanAnalyzer(exec, {
        instructions,
        cwd: config.stateDir,
      }),
      ledger: new FileTriageLedger(config.stateDir),
    },
    {
      clock: runtime.clock,
      policy: { ...DEFAULT_POLICY, trustedAuthors: config.trustedAuthors },
    },
  );
  return {
    ...container,
    notifier: notifierFor(runtime.platform ?? process.platform, exec),
  };
}

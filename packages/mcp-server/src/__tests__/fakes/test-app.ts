import { createApp } from "../../app";
import { buildContainer } from "../../container";
import type { OAuthRouteOptions } from "../../routes/oauth";
import { buildOAuthUseCases } from "../../usecases/oauth";
import { fixedClock } from "./fixed-clock";
import { fakeTokenVerifier } from "./fake-token-verifier";
import { InMemoryChecklistRepository } from "./in-memory-checklist-repository";
import { InMemoryFeedbackRepository } from "./in-memory-feedback-repository";
import { InMemoryProfileRepository } from "./in-memory-profile-repository";
import {
  FakeIdentityProvider,
  InMemoryAuthCodeStore,
  InMemoryOAuthClientStore,
} from "./in-memory-oauth-stores";

export function createTestApp(
  options: { oauthOptions?: OAuthRouteOptions } = {},
) {
  const repo = new InMemoryChecklistRepository();
  const feedback = new InMemoryFeedbackRepository();
  const profiles = new InMemoryProfileRepository();
  const identity = new FakeIdentityProvider();
  const clients = new InMemoryOAuthClientStore();
  const codes = new InMemoryAuthCodeStore();
  const app = createApp({
    mcp: {
      verifier: fakeTokenVerifier,
      useCasesFor: () =>
        buildContainer(
          {
            checklistRepository: repo,
            feedbackRepository: feedback,
            profileRepository: profiles,
          },
          { clock: fixedClock() },
        ),
      oauth: buildOAuthUseCases({
        clients,
        codes,
        identity,
        clock: { now: () => new Date() },
      }),
      oauthOptions: options.oauthOptions,
    },
  });
  return { app, repo, feedback, profiles, identity, clients, codes };
}

let nextId = 1;

export function rpc(
  method: string,
  params: Record<string, unknown> = {},
  init: { token?: string | null; origin?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const token = init.token === undefined ? "token-for:alice" : init.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.origin) headers.Origin = init.origin;
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

export async function callTool(
  app: ReturnType<typeof createTestApp>["app"],
  name: string,
  args: Record<string, unknown> = {},
  token = "token-for:alice",
) {
  const res = await app.fetch(
    rpc("tools/call", { name, arguments: args }, { token }),
  );
  const body = await res.json();
  const result = body.result as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  return {
    isError: result.isError ?? false,
    text: result.content[0].text,
    json: () => JSON.parse(result.content[0].text),
  };
}

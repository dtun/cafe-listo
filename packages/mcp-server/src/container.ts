import {
  CATALOG_ITEMS,
  CATEGORIES,
  PREP_ITEMS,
  type ChecklistRepository,
  type FeedbackRepository,
  type ProfileRepository,
} from "@cafe-listo/shared";
import {
  createAnonSupabaseClient,
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "./adapters/supabase/client";
import { SupabaseIdentityProvider } from "./adapters/supabase/supabase-identity-provider";
import {
  SupabaseAuthCodeStore,
  SupabaseOAuthClientStore,
} from "./adapters/supabase/supabase-oauth-stores";
import { SupabaseChecklistRepository } from "./adapters/supabase/supabase-checklist-repository";
import { SupabaseFeedbackRepository } from "./adapters/supabase/supabase-feedback-repository";
import { SupabaseProfileRepository } from "./adapters/supabase/supabase-profile-repository";
import type { RequestAuth } from "./auth/types";
import { GetChecklist } from "./usecases/get-checklist";
import { GetHousehold } from "./usecases/get-household";
import { ListCategories } from "./usecases/list-categories";
import { ListItems } from "./usecases/list-items";
import { ResetChecklist } from "./usecases/reset-checklist";
import { buildOAuthUseCases, type OAuthUseCases } from "./usecases/oauth";
import { SetHousehold } from "./usecases/set-household";
import { SetItemDone } from "./usecases/set-item-done";
import { SubmitFeedback } from "./usecases/submit-feedback";
import { UpdateItems } from "./usecases/update-items";
import {
  randomUuids,
  systemClock,
  type Catalog,
  type Clock,
  type IdGenerator,
} from "./usecases/types";

export interface UseCases {
  listCategories: ListCategories;
  listItems: ListItems;
  getChecklist: GetChecklist;
  setItemDone: SetItemDone;
  resetChecklist: ResetChecklist;
  submitFeedback: SubmitFeedback;
  getHousehold: GetHousehold;
  setHousehold: SetHousehold;
  updateItems: UpdateItems;
}

export interface ContainerDeps {
  checklistRepository: ChecklistRepository;
  feedbackRepository: FeedbackRepository;
  profileRepository: ProfileRepository;
}

export interface ContainerOverrides {
  clock?: Clock;
  catalog?: Catalog;
  ids?: IdGenerator;
}

/** Composition root: wires adapters into use cases. No DI library. */
export function buildContainer(
  deps: ContainerDeps,
  overrides: ContainerOverrides = {},
): UseCases {
  const clock = overrides.clock ?? systemClock;
  const catalog = overrides.catalog ?? {
    categories: CATEGORIES,
    items: PREP_ITEMS,
  };
  const repo = deps.checklistRepository;

  return Object.freeze({
    listCategories: new ListCategories(catalog.categories),
    listItems: new ListItems(catalog.items),
    getChecklist: new GetChecklist(repo, catalog),
    setItemDone: new SetItemDone(repo, catalog, clock),
    resetChecklist: new ResetChecklist(repo),
    submitFeedback: new SubmitFeedback(
      deps.feedbackRepository,
      clock,
      overrides.ids ?? randomUuids,
    ),
    getHousehold: new GetHousehold(deps.profileRepository),
    setHousehold: new SetHousehold(deps.profileRepository, clock),
    updateItems: new UpdateItems(repo, CATALOG_ITEMS, clock),
  });
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseServerConfig extends SupabaseConfig {
  serviceRoleKey: string;
}

/** Per-request use cases backed by Supabase, acting as the caller so RLS applies. */
export function supabaseUseCasesFor(
  config: SupabaseConfig,
  overrides: ContainerOverrides = {},
): (auth: RequestAuth) => UseCases {
  return (auth) => {
    const client = createUserSupabaseClient({
      ...config,
      accessToken: auth.accessToken,
    });
    return buildContainer(
      {
        checklistRepository: new SupabaseChecklistRepository(client),
        feedbackRepository: new SupabaseFeedbackRepository(client),
        profileRepository: new SupabaseProfileRepository(client),
      },
      overrides,
    );
  };
}

/** OAuth server state lives in service-role-only tables; sign-in goes through Supabase Auth. */
export function supabaseOAuthUseCases(
  config: SupabaseServerConfig,
  overrides: ContainerOverrides = {},
): OAuthUseCases {
  const service = createServiceSupabaseClient(config);
  const clock = overrides.clock ?? systemClock;
  return buildOAuthUseCases({
    clients: new SupabaseOAuthClientStore(service),
    codes: new SupabaseAuthCodeStore(service, clock),
    identity: new SupabaseIdentityProvider(createAnonSupabaseClient(config)),
    clock,
  });
}

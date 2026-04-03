import { createStore } from "tinybase/store";
import { createExpoSqlitePersister } from "tinybase/persisters/persister-expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import { PREP_ITEMS } from "@cafe-listo/shared";
import type { Store } from "tinybase/store";

const DB_NAME = "cafe-listo.db";

export function createChecklistStore(): Store {
  const store = createStore();

  const table: Record<string, { done: boolean }> = {};
  for (const item of PREP_ITEMS) {
    table[item.id] = { done: false };
  }
  store.setTable("checklist", table);

  return store;
}

export function createChecklistPersister(store: Store) {
  const db = openDatabaseSync(DB_NAME);
  return createExpoSqlitePersister(store, db);
}

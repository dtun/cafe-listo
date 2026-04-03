import { useState, useEffect, useMemo, useCallback } from "react";
import { PREP_ITEMS, ChecklistState } from "@cafe-listo/shared";
import { createChecklistStore, createChecklistPersister } from "../store";
import type { Store } from "tinybase/store";

export function useChecklist(injectedStore?: Store) {
  const [store] = useState<Store>(
    () => injectedStore ?? createChecklistStore(),
  );

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ChecklistState>(() => deriveState(store));

  useEffect(() => {
    let cancelled = false;
    const persister = createChecklistPersister(store);

    persister
      .startAutoLoad([store.getTables(), store.getValues()])
      .then(() => persister.startAutoSave())
      .then(() => {
        if (!cancelled) {
          setState(deriveState(store));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      persister.destroy();
    };
  }, [store]);

  useEffect(() => {
    const listenerId = store.addTableListener("checklist", () => {
      setState(deriveState(store));
    });
    return () => {
      store.delListener(listenerId);
    };
  }, [store]);

  const toggle = useCallback(
    (itemId: string) => {
      const current = store.getCell("checklist", itemId, "done") as boolean;
      store.setCell("checklist", itemId, "done", !current);
    },
    [store],
  );

  const reset = useCallback(() => {
    for (const item of PREP_ITEMS) {
      store.setCell("checklist", item.id, "done", false);
    }
  }, [store]);

  const progress = useMemo(() => {
    const checked = Object.values(state).filter(Boolean).length;
    return { checked, total: PREP_ITEMS.length };
  }, [state]);

  return { state, toggle, reset, progress, loading };
}

function deriveState(store: Store): ChecklistState {
  const result: ChecklistState = {};
  for (const item of PREP_ITEMS) {
    result[item.id] = (store.getCell("checklist", item.id, "done") ??
      false) as boolean;
  }
  return result;
}

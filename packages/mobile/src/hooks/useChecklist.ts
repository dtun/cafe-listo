import { useState, useMemo } from "react";
import {
  PREP_ITEMS,
  createInitialChecklistState,
  ChecklistState,
} from "@cafe-listo/shared";

export function useChecklist() {
  const [state, setState] = useState<ChecklistState>(
    createInitialChecklistState,
  );

  const toggle = (itemId: string) => {
    setState((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const reset = () => {
    setState(createInitialChecklistState());
  };

  const progress = useMemo(() => {
    const checked = Object.values(state).filter(Boolean).length;
    return { checked, total: PREP_ITEMS.length };
  }, [state]);

  return { state, toggle, reset, progress };
}

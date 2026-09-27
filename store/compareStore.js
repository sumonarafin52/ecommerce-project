// store/compareStore.js
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const COMPARE_MAX = 4;

const useCompareStore = create(
  persist(
    (set, get) => ({
      ids: [],
      has: (id) => get().ids.includes(String(id)),
      // returns false when the list is full, so callers can tell the user
      toggle: (id) => {
        const key = String(id);
        const { ids } = get();
        if (ids.includes(key)) {
          set({ ids: ids.filter((x) => x !== key) });
          return true;
        }
        if (ids.length >= COMPARE_MAX) return false;
        set({ ids: [...ids, key] });
        return true;
      },
      remove: (id) => set({ ids: get().ids.filter((x) => x !== String(id)) }),
      clear: () => set({ ids: [] }),
    }),
    { name: "compare-storage" }
  )
);

export default useCompareStore;

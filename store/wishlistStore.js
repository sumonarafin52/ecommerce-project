// store/wishlistStore.js
import { create } from "zustand";

const useWishlistStore = create((set, get) => ({
  ids: new Set(),
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/wishlist").then((r) => r.json());
      if (res.success) {
        set({ ids: new Set(res.data.map((w) => String(w.product._id))), loaded: true });
      }
    } catch {
      // leave whatever state we had — a failed refresh shouldn't wipe it
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ ids: new Set(), loaded: false }),

  has: (productId) => get().ids.has(String(productId)),

  // optimistic toggle — updates the UI immediately, rolls back if the
  // request fails so the button never lies about the saved state
  toggle: async (productId) => {
    const id = String(productId);
    const wasSaved = get().ids.has(id);

    set((state) => {
      const next = new Set(state.ids);
      wasSaved ? next.delete(id) : next.add(id);
      return { ids: next };
    });

    try {
      const res = wasSaved
        ? await fetch(`/api/wishlist/${id}`, { method: "DELETE" }).then((r) => r.json())
        : await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product: id }),
          }).then((r) => r.json());

      if (!res.success) throw new Error(res.message);
    } catch {
      set((state) => {
        const next = new Set(state.ids);
        wasSaved ? next.add(id) : next.delete(id);
        return { ids: next };
      });
    }
  },
}));

export default useWishlistStore;

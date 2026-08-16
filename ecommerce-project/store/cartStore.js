// store/cartStore.js
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) =>
        set((state) => {
          const existing = state.items.find((i) => i._id === product._id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i._id === product._id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...product, quantity: 1 }] };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i._id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i._id !== id)
              : state.items.map((i) => (i._id === id ? { ...i, quantity } : i)),
        })),

      clearCart: () => set({ items: [] }),

      // Computed/Selector functions
      getTotalPrice: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      },

      getTotalQuantity: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + item.quantity, 0);
      },

      hasItem: (id) => {
        const state = get();
        return state.items.some((i) => i._id === id);
      },
    }),
    { name: "cart-storage" }
  )
);

export default useCartStore;
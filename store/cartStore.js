// store/cartStore.js
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getEffectivePrice } from "@/lib/utils";

// Two different variants of the same product (Size S vs Size M) must stay
// as separate cart lines — matching on product._id alone (the old
// behavior) silently merged them into one line and lost which size was
// actually selected.
const cartKeyOf = (item) => `${item._id}${item.combinationKey ? `:${item.combinationKey}` : ""}`;

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product) =>
        set((state) => {
          const key = cartKeyOf(product);
          const existing = state.items.find((i) => cartKeyOf(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) => (cartKeyOf(i) === key ? { ...i, quantity: i.quantity + 1 } : i)),
            };
          }
          return { items: [...state.items, { ...product, quantity: 1 }] };
        }),

      removeItem: (cartKey) =>
        set((state) => ({
          items: state.items.filter((i) => cartKeyOf(i) !== cartKey),
        })),

      updateQuantity: (cartKey, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => cartKeyOf(i) !== cartKey)
              : state.items.map((i) => (cartKeyOf(i) === cartKey ? { ...i, quantity } : i)),
        })),

      clearCart: () => set({ items: [] }),

      // Computed/Selector functions
      getTotalPrice: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);
      },

      getTotalQuantity: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + item.quantity, 0);
      },

      hasItem: (cartKey) => {
        const state = get();
        return state.items.some((i) => cartKeyOf(i) === cartKey);
      },
    }),
    { name: "cart-storage" }
  )
);

export { cartKeyOf };
export default useCartStore;

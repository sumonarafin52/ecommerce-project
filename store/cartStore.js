// store/cartStore.js
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getEffectivePrice } from "@/lib/utils";
import { recordAddToCart } from "@/lib/productSignals";

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
          // Recorded here rather than at each button, because six different
          // places add to the basket (product page, card, quick view,
          // compare, wishlist) and a seventh would have been missed. The
          // helper swallows repeats, so adding three of something counts
          // once. Fire-and-forget: it never delays the basket updating.
          recordAddToCart(product?._id);

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

      /**
       * Brings the cart in line with what the shop currently sells.
       *
       * `lines` is the server's answer from /api/cart — current price, the
       * quantity actually available, and what changed. Applying it is what
       * stops the shopper seeing a total that no longer exists: before this,
       * a cart kept whatever price it was stored with, and the difference
       * only surfaced after Place Order.
       *
       * Lines the server could not fulfil at all come back with quantity 0
       * and are dropped. The caller is responsible for telling the shopper
       * what happened — this only corrects the numbers.
       */
      applyRevalidation: (lines) =>
        set((state) => {
          const byKey = new Map(
            (lines || []).map((l) => [`${l.product}${l.combinationKey ? `:${l.combinationKey}` : ""}`, l])
          );
          return {
            items: state.items
              .map((item) => {
                const line = byKey.get(cartKeyOf(item));
                // An item the server said nothing about is left exactly as
                // it was, rather than being guessed at or thrown away.
                if (!line) return item;
                if (!line.quantity) return null;
                return {
                  ...item,
                  name: line.name || item.name,
                  slug: line.slug || item.slug,
                  // Written to `price` with discountPrice cleared, because
                  // getEffectivePrice prefers discountPrice — leaving a
                  // stale one there would keep the old number winning.
                  price: line.price,
                  discountPrice: 0,
                  stock: line.stock,
                  quantity: line.quantity,
                };
              })
              .filter(Boolean),
          };
        }),

      /**
       * Folds the basket saved on the server into the one in this browser.
       *
       * `lines` is what /api/cart/saved returned: every saved line, already
       * re-checked against the catalogue, so each carries a current name,
       * price, image and stock — which is what makes a line that exists
       * only on the server renderable here at all.
       *
       * Quantities are taken at their highest rather than summed, for the
       * same reason as lib/savedCart.js: signing in twice on the same
       * device must not keep growing the basket.
       */
      mergeServerCart: (lines) =>
        set((state) => {
          const items = [...state.items];
          const index = new Map(items.map((item, i) => [cartKeyOf(item), i]));

          for (const line of lines || []) {
            // A saved line that has since sold out or been unpublished comes
            // back with quantity 0. Restoring it would put something
            // unbuyable in front of the shopper with no explanation.
            if (!line?.quantity) continue;

            const key = `${line.product}${line.combinationKey ? `:${line.combinationKey}` : ""}`;
            const at = index.get(key);

            if (at === undefined) {
              items.push({
                _id: line.product,
                combinationKey: line.combinationKey || "",
                name: line.name,
                slug: line.slug || "",
                images: line.image ? [line.image] : [],
                price: line.price,
                discountPrice: 0,
                stock: line.stock,
                quantity: line.quantity,
              });
            } else if (line.quantity > items[at].quantity) {
              items[at] = { ...items[at], quantity: Math.min(line.quantity, line.stock || line.quantity) };
            }
          }

          return { items };
        }),

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

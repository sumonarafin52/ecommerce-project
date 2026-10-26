// lib/categoryIcons.js
//
// Which icon a category tile shows when the admin hasn't uploaded an image.
// Matched on keywords in English and Bangla.
//
// These are names from components/ui/Icon.jsx, not emoji. Besides looking
// like a different design on every operating system, the emoji version had
// one keyword row covering "home|kitchen|furnitur|decor" — so Home and
// Kitchen were given the same house and a shopper could not tell the two
// tiles apart at a glance. Kitchen now has its own, and the more specific
// patterns are tested first so "kitchen" can never fall through to "home".
export const CATEGORY_ICONS = [
  [/kitchen|cookware|utensil|রান্না/i, "kitchen"],
  [/electr|phone|mobile|gadget|laptop|computer|ইলেক/i, "phone"],
  [/fashion|cloth|wear|dress|saree|panjabi|shirt|পোশাক/i, "shirt"],
  [/shoe|footwear|sneaker|জুতা/i, "shoe"],
  [/home|furnitur|decor|interior|ঘর/i, "home"],
  [/beauty|cosmetic|skin|makeup|care|সৌন্দর্য/i, "beauty"],
  [/baby|kid|toy|শিশু/i, "toy"],
  [/sport|fitness|gym|খেলা/i, "sport"],
  [/book|station|বই/i, "book"],
  [/health|medic|pharma|স্বাস্থ্য/i, "health"],
  [/jewel|watch|access|গহনা/i, "watch"],
  [/pet|পোষা/i, "pet"],
  [/ice ?cream|dessert|sweet|cake|bakery|chocolate|মিষ্টি|আইসক্রিম/i, "dessert"],
  [/drink|juice|beverage|shake|lassi|tea|coffee|পানীয়/i, "drink"],
  [/poster|\bart\b|artwork|print|paint|frame|ছবি/i, "art"],
  [/fruit|vegetable|fresh|ফল|সবজি/i, "produce"],
  [/meat|fish|chicken|মাছ|মাংস/i, "fish"],
  [/snack|fast ?food|burger|pizza|restaurant/i, "snack"],
  [/bag|luggage|ব্যাগ/i, "bag"],
  [/gift|হাদিয়া|উপহার/i, "gift"],
  [/\bcars?\b|bike|motor|\bauto/i, "car"],
  [/grocer|food|rice|খাদ্য|মুদি/i, "grocery"],
];

/** The icon name for a category, falling back to a generic shopfront. */
export const categoryIcon = (name = "") => (CATEGORY_ICONS.find(([re]) => re.test(name)) || [null, "shop"])[1];

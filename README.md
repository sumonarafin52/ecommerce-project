# MyShop — E-commerce Project (Next.js Full-Stack)

এইটা একটা **starter skeleton**। প্রতিটা file-এ `// TODO:` কমেন্ট দিয়ে বলা আছে
সেখানে কী code বসবে। তুমি একটা একটা করে file ধরে কাজ করবে —
অন্য AI থেকে পাওয়া code বা নিজের লেখা code দিয়ে সেই TODO জায়গাগুলো replace করবে।

## কিভাবে run করবে (প্রথমবার)

```bash
npm install
cp .env.example .env      # তারপর .env ফাইলে তোমার আসল values বসাও
npm run dev
```

Browser এ যাও: http://localhost:3000

> **.env লাগবে যেভাবে:**
> - `MONGODB_URI` → MongoDB Atlas এ ফ্রি cluster বানিয়ে connection string নাও
> - `NEXTAUTH_SECRET` → টার্মিনালে `openssl rand -base64 32` চালিয়ে random string generate করো
> - বাকিগুলো (Cloudinary, SSLCommerz) পরে লাগবে, শুরুতে ফাঁকা রাখলেও চলবে

## Folder Structure ব্যাখ্যা

```
ecommerce-project/
├── app/                        # সব pages এবং routes (Next.js App Router)
│   ├── layout.js               # Root layout (Header + Footer সব page এ থাকবে)
│   ├── page.js                 # Homepage ( / )
│   ├── products/
│   │   ├── page.js             # সব product list ( /products )
│   │   └── [id]/page.js        # একটা product এর details ( /products/123 )
│   ├── cart/page.js            # Cart page ( /cart )
│   ├── checkout/page.js        # Checkout page ( /checkout )
│   ├── login/page.js           # Login page
│   ├── register/page.js        # Registration page
│   ├── profile/page.js         # User profile + order history
│   ├── admin/                  # Admin dashboard pages
│   │   ├── page.js             # Dashboard summary
│   │   ├── products/page.js    # Product manage করা
│   │   └── orders/page.js      # Order manage করা
│   └── api/                    # ---- BACKEND (API routes) ----
│       ├── products/route.js          # GET (list) + POST (create)
│       ├── products/[id]/route.js     # GET, PUT, DELETE (single product)
│       ├── users/route.js             # POST (register)
│       ├── auth/[...nextauth]/route.js # Login/session handling
│       ├── orders/route.js            # GET, POST (orders)
│       ├── cart/route.js              # GET, POST (server-saved cart, optional)
│       └── checkout/route.js          # Payment gateway trigger
│
├── components/                 # Reusable UI pieces
│   ├── layout/Header.jsx, Footer.jsx
│   ├── product/ProductCard.jsx, ProductGrid.jsx
│   ├── cart/CartItem.jsx
│   ├── admin/ProductTable.jsx
│   └── ui/Button.jsx
│
├── models/                      # MongoDB schema (Mongoose)
│   ├── Product.js
│   ├── User.js
│   ├── Order.js
│   └── Review.js
│
├── lib/
│   ├── db.js                    # MongoDB connection helper
│   └── utils.js                 # ছোট helper functions
│
├── store/
│   └── cartStore.js             # Zustand দিয়ে cart state (client-side)
│
├── styles/globals.css           # Global CSS + Tailwind
├── public/images/               # Static images
├── .env.example                 # কোন env variable লাগবে তার তালিকা
├── tailwind.config.js
├── next.config.js
└── package.json
```

## কাজ করার সাজেস্টেড order (file ধরে ধরে)

1. `lib/db.js` → MongoDB connect ঠিকমতো কাজ করছে কিনা টেস্ট করো
2. `models/Product.js`, `User.js`, `Order.js`, `Review.js` → schema চূড়ান্ত করো
3. `app/api/products/route.js` + `app/api/products/[id]/route.js` → backend product CRUD
4. `components/product/ProductCard.jsx` + `ProductGrid.jsx` → product দেখানোর UI
5. `app/page.js` (Homepage) এবং `app/products/page.js` (Product listing)
6. `app/products/[id]/page.js` → Product details page
7. `store/cartStore.js` + `app/cart/page.js` → Cart কাজ করানো
8. `app/api/users/route.js` + `app/api/auth/[...nextauth]/route.js` → Login/Register
9. `app/checkout/page.js` + `app/api/checkout/route.js` → Payment
10. `app/admin/**` → Admin dashboard
11. সবশেষে polish: SEO metadata, loading states, mobile responsiveness

## আমাকে (Claude) কীভাবে সাহায্যের জন্য দিবে

যখন কোনো নির্দিষ্ট file নিয়ে কাজ করবে, আমাকে বলো:
- কোন file (path সহ, যেমন `app/api/products/route.js`)
- অন্য AI থেকে পাওয়া code থাকলে সেটা paste করো
- আমি সেটা review করে, এই project-এর structure/convention এর সাথে মিলিয়ে,
  বাগ ঠিক করে, ফাইলে বসিয়ে দিবো

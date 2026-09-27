# Going live

Follow these steps in order. `npm run preflight` checks nearly all of them for you.

## 1. Environment variables

Copy `.env.example` to `.env.local` (or set these in your host's dashboard):

| Variable | What to set | Why it matters |
|---|---|---|
| `MONGODB_URI` | Your production database | — |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Signs login sessions. Never reuse the dev value. |
| `NEXTAUTH_URL` | `https://yourdomain.com` | Login redirects and emailed links (password reset) use this. |
| `PAYMENT_ENCRYPTION_KEY` | `openssl rand -base64 32` — **a different value** | Encrypts saved gateway credentials. If unset, `NEXTAUTH_SECRET` is used, and rotating that secret later makes every saved credential unreadable. Set it once and never change it. |
| `CLOUDINARY_*` | From your Cloudinary dashboard | Product image uploads. |

## 2. Database

Use **MongoDB Atlas** (any tier, including the free one). It's a replica set out of the box, which checkout needs for transactions: stock, coupon, and order are then committed together or not at all.

On a self-hosted standalone `mongod`, checkout still works and still prevents overselling, but loses that all-or-nothing rollback. If you self-host, run `mongod` as a single-node replica set.

## 3. Build and start

```bash
npm install
npm run build
npm start
```

## 4. Create your admin account

Signups are always customers, so on a fresh database nobody can open `/admin` until you run:

```bash
npm run create-admin -- --email=you@example.com --name="Your Name" --password='a-strong-password'
```

Already registered through the site? Promote that account instead:

```bash
node scripts/create-admin.js --email=you@example.com --promote
```

## 5. In the admin panel

- **Settings → Email Notifications** — configure SMTP and click *Send test email*. **Required**: without it, password-reset links can't be delivered and customers who forget their password are locked out.
- **Settings → Payment Methods** — enter SSLCommerz **live** credentials and switch the mode to **Live**.
- **Settings → General** — store name, logo, contact details.

## 6. Run the preflight check

```bash
npm run preflight
```

Fix every `✗`. Review every `⚠`. It exits with code 1 while anything blocking remains, so you can use it to gate a deploy.

## 7. If you're migrating an existing database

Release stock still held by old failed payments (dry run first, then apply):

```bash
npm run reconcile:stock
node scripts/reconcile-leaked-stock.js --apply
```

## Hosting notes

- **Rate limiting** (login, signup, password reset, checkout) is stored in MongoDB, so it works correctly across multiple server instances and on serverless hosting.
- **Password-reset emails are sent in the background** so response timing can't reveal which emails have accounts. On a long-running server (VPS, Railway, Render) this is fully reliable. On serverless (Vercel), a background send can occasionally be cut off when the function freezes after responding; if customers report missing reset emails there, host on a long-running server instead.
- **Monitoring**: errors currently go to the server log. Adding an error tracker such as Sentry is recommended once you have traffic.

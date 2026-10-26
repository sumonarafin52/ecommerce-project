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

Give existing products their readable URLs. Products created before slugs
existed have none, so they stay at `/products/<id>` until this runs — new
products get one automatically. Dry run first to see the URLs it will
assign:

```bash
npm run backfill:slugs -- --dry-run
npm run backfill:slugs
```

Safe to run repeatedly: it only fills in products that have no slug, and
never changes one that is already set, so a URL already out in the world
stays put. Old `/products/<id>` links keep working either way — they answer
with a 308 to the new address.

## Hosting notes

- **Rate limiting** (login, signup, password reset, checkout) is stored in MongoDB, so it works correctly across multiple server instances and on serverless hosting.
- **Password-reset emails are sent in the background** so response timing can't reveal which emails have accounts. On a long-running server (VPS, Railway, Render) this is fully reliable. On serverless (Vercel), a background send can occasionally be cut off when the function freezes after responding; if customers report missing reset emails there, host on a long-running server instead.
- **Monitoring**: errors currently go to the server log. Adding an error tracker such as Sentry is recommended once you have traffic.

## SSLCommerz: two things that only break in production

Both of these were live bugs, and both were invisible in `next dev`:

**1. The SDK must not be bundled.** `next.config.js` lists `sslcommerz-lts`
under `experimental.serverComponentsExternalPackages`. Without it, Next
bundles and minifies the CommonJS SDK into the route and every payment
attempt throws `i is not a function` — only in a production build. If you
change the payment code, start a payment against a `next build` output, not
just `next dev`.

**2. A courier order needs shipping fields.** SSLCommerz rejects
`shipping_method: "Courier"` unless `ship_name`, `ship_add1`, `ship_city`,
`ship_postcode` and `ship_country` are all present
("Invalid Information! 'ship_name' is missing"). Download-only orders send
`shipping_method: "NO"` and `product_profile: "non-physical-goods"` instead.
Both shapes are built in `lib/payments/sslcommerz.js`.

Either spelling of the store password works: `SSLCOMMERZ_STORE_PASS` or
`SSLCOMMERZ_STORE_PASSWORD`.

## Guest orders: the recurring trap

Guest checkout made `Order.user` optional. Six separate routes were written
before that and dereferenced it anyway (`order.user.toString()`,
`order.user._id`), which answered **500 for every guest order** — invoices
unreachable, orders impossible for staff to progress, tracking broken.

`tests/guestAccess.test.js` sweeps the order routes with a guest order and
asserts none of them answer 5xx. **Any new route that touches an order
belongs in that sweep.** The rule when reading an order:

```js
const isOwner = !!session?.user && !!order.user && order.user.toString() === session.user.id;
const isGuestHolder = !!guestToken && !!order.guestAccessToken && timingSafeEqualStr(guestToken, order.guestAccessToken);
```

Guests also have no account to receive in-app notifications, so `notify()`
takes `guestEmail` and emails them instead. Pass both at every call site:

```js
notify({ user: order.user, guestEmail: order.guestEmail, ... })
```

## Smoke-test before shipping

Unit tests mock the gateway and the mailer, and `next dev` does not minify —
between them they hid three live payment bugs and six guest-order bugs. Before
a release, run a production build and walk the real paths: register, a COD
order as a customer **and as a guest**, the invoice and its PDF, an admin
status change, and a digital download.

## Notifications

One pipeline (`lib/notify.js`) fans out to three channels — in-app, email and
SMS. Which events use which channel is set in **Admin → Settings →
Notifications**; the catalogue of events lives in `lib/notifications/events.js`.

Two rules worth knowing before changing it:

* **Absent settings mean "not configured", never "off".** A store that has
  never opened that page has no `notifications` block, and must keep emailing
  its customers exactly as before. Only an explicit `false` disables a channel.
* **SMS is opt-in per event, and only for events marked `smsWorthy`.** Nothing
  defaults to SMS, because every message is billed. Texting someone that their
  product question was answered is how a store teaches people to ignore it.

Call sites pass `phone` (from `order.shippingAddress.phone`) for order events;
without it, no SMS is attempted. Every attempt — delivered or not — is written
to `NotificationLog` and shown on that settings page, which is how you answer
"the customer says they never got it".

## bKash

bKash is a real integration now (`lib/payments/bkash.js`), using their
tokenized checkout API. Switch it on in **Settings → Payment Methods**,
fill in the four values bKash gives you (App Key, App Secret, Username,
Password), choose Sandbox or Live, save, then press **Test connection** —
that makes a real token request with the credentials as stored and reports
bKash's own answer. Do that before a customer does it for you.

Once enabled and configured it appears at checkout automatically; the
`checkoutLive` flag and the adapter registry are checked against each other
by a test, so the two cannot drift apart.

**What is verified, and what is not.** Every branch of the flow is covered
by tests, and the whole round trip — checkout, bKash's page, the redirect
back, the order marked paid — has been driven in a real browser against a
stub that answers the way bKash's documentation describes. What has *not*
happened is a payment against bKash's own sandbox with real merchant
credentials, because those are yours. Run one before going live. If bKash's
responses differ from their documentation, the adapter is where to look.

Three things in the implementation worth knowing:

* **The redirect is never believed.** bKash sends the customer's own
  browser back to the store, so `status=success` in that URL means nothing.
  The order is marked paid only after a server-to-server execute (or status
  query) confirms it, and only if the amount matches.
* **A lost execute is not a failure.** Execute can only be called once, so
  if its response goes missing the payment status is queried before
  deciding. Treating a lost response as "unpaid" would take a customer's
  money and give them nothing.
* **The order is found by the payment id the store recorded**, never by
  anything in the callback URL — that URL is the customer's to edit.

`BKASH_API_BASE` redirects the sandbox to another host for testing. Live
mode ignores it entirely, so it cannot divert a real payment.

Nagad, Rocket, Stripe and PayPal remain configurable but have no adapter,
so they stay off checkout rather than being offered and failing.

## Restocking

**Products → Restock** turns "twelve products are low" into a decision. For
each line it works out how fast it actually sells (from the stock ledger's
own sale rows, so cancelled orders net themselves out), how many days the
stock on hand will last, and how many to order to put 30 days back.

Worst first: already out, then soonest to run out.

Where it stays quiet, that is deliberate:

* **Fewer than 3 units sold in the window → no rate, no days, no
  suggestion.** A rate from one or two sales swings on a single order, and
  a reorder quantity derived from it is a guess wearing a number's
  confidence. The page prints a dash.
* **Stock but no recent sales → no cover figure.** That is a product
  nobody is buying, which is a different problem — Products → Performance
  is where that one shows up.
* **A product already at zero is "already out"**, not "runs out in under a
  day".

Rates are measured from the first sale in the window, counting that day, so
a product that only started selling last week is not averaged over a month
it did not exist for.

**Who gets low-stock alerts** follows the `products` permission rather than
the `admin` role, so an editor or stock manager who actually looks after
inventory is told. When several lines cross at once the shop sends one
digest rather than one message per product per person — a busy hour that
emptied six lines used to produce six notifications to each admin.

## Stock history

Every change to a stock number is recorded: how many, which way, what
caused it, and what the number was left at. **Products → Stock History**
shows the lot, filterable by reason, and clicking a product narrows it to
that product's own story.

Six things move stock — an order placed, an order cancelled, a payment that
failed, a return received, a product edited, a product created — and all of
them record through one place (`lib/productStock.js`), so a seventh gets
recorded automatically rather than being quietly missed.

The ledger is append-only. A correction is a new row, never an edit to an
old one, because a history you can rewrite answers nothing.

**The integrity check** on a single product compares the sum of its
movements with the number on the product, and says one of three things:

* **The history adds up** — every change since the product was created is
  accounted for.
* **History starts partway through** — the product existed before this
  feature, so it has no opening entry and will never balance. Expected, and
  not a problem.
* **Stock moved without being recorded** — the history is complete and
  still doesn't match. Something changed stock outside the shop: a direct
  database edit, a restored backup, or a bug. Worth looking into.

A discrepancy is reported, never corrected. Quietly "fixing" it would
destroy the evidence of whatever caused it, which is the only thing that
makes it findable.

## Product performance: what the numbers are

**Products → Performance** answers the question orders can't: which products
are being looked at and not bought. Views and basket adds are counted as
people browse (`models/ProductStat.js`); units and revenue come from the
order collection.

What is stored is a counter per product per day — no visitor row, no
identifier, no IP, no extra cookie. The shop learns that forty people
looked at a jacket; it does not learn which forty.

Three things to know before acting on it:

* **These are best-effort signals, not audited figures.** They come from
  the browser and are rate limited per address, which is enough to stop
  casual inflation and not enough to make them tamper-proof. Use them to
  compare products with each other. Every money figure on that page comes
  from orders, never from these counters.
* **A view is once per shopper per visit**, not once per page load — a
  shopper flipping between two sizes is one view each, and refreshing
  changes nothing. An add-to-cart is counted once per product per five
  seconds, so adding three of something is one basket event.
* **Rates appear only above 20 views** in the period. Below that a
  percentage swings on a single sale, and "0% conversion" from four views
  reads like a finding when it is noise. The page prints a dash instead.

Days are counted on the shop's own clock, the same one the reports page
uses — see below.

## The shop's clock

**Settings → General → Store Timezone** decides which day an order belongs
to. Everything counted per day reads it: the daily revenue chart, "today's
orders", the week figures, and the CSV export.

Set it before you read anything into the numbers. It defaults to
`Asia/Dhaka`, and an existing database with no value stored gets that
default — so a shop trading elsewhere should change it on day one.

Why it matters: days used to be bucketed in UTC while "today" was cut from
the server's clock and the chart's labels were built from the browser's.
For a shop six hours ahead, every order taken between midnight and 6am was
reported on the previous day, and the labels did not line up with the bars.
All three now come from this one setting (`lib/storeTime.js`), and the
server sends the chart a complete, pre-labelled series so the browser never
does date arithmetic of its own.

An unrecognised timezone would make MongoDB reject every report
aggregation, so the value is validated on save and falls back rather than
taking the reports page down.

## Abandoned basket reminders

A signed-in customer's basket is saved to the server (`models/Cart.js`), which
is what makes it survive a change of device — and what makes an abandoned
basket something the shop can see at all. Guests have no row: there is nobody
to tie one to.

**Admin → Abandoned Baskets** lists them and can send a reminder by hand. For
the automatic sweep, something outside the app has to decide when "now" is: a
Next.js server can run as several instances, or be asleep between requests, so
an internal timer would either never fire or fire once per instance.

Set `CART_SWEEP_SECRET` (`openssl rand -base64 32`) and call the endpoint on a
schedule — hourly is plenty:

```
0 * * * * curl -fsS -X POST https://your-store.com/api/admin/carts/sweep \
  -H "Authorization: Bearer $CART_SWEEP_SECRET" >/dev/null
```

Leave the secret unset and the scheduled route is **closed**, not open: without
that check, anyone on the internet could make the shop mail its customers.
Staff with the Baskets permission can still send from the admin page.

What stops it becoming spam, all enforced server-side:

* **One reminder per basket.** Counted on the basket itself (`reminderCount`),
  so there is no loop to run away with. The admin's send button cannot
  override it.
* **Consent.** `user.emailPrefs.cartReminders` is checked before every send.
  Every reminder carries a signed one-click off switch
  (`lib/signedLink.js` → `/email-preferences`), and the same toggle is in the
  customer's profile settings. The link can only ever turn reminders *off*.
* **Substance.** A basket whose items have all sold out or been withdrawn
  produces no email — the admin list says so rather than appearing to send.
* **Honest attribution.** A basket counts as recovered only when an order
  follows a reminder that was actually sent, within
  `RECOVERY_WINDOW_HOURS` (72). Orders the shop would have had anyway are not
  credited to it.

The windows are constants at the top of `lib/savedCart.js`, and both the
sweep and the admin list read them, so they can never disagree about what
"abandoned" means.

## The 100-order cap

`GET /api/orders` returns at most 100 orders. Four separate parts of the
admin fetched it and counted the array in the browser, so every one of those
figures silently stopped being true once a store passed 100 orders:

| Where | Showed | Actually |
|---|---|---|
| Dashboard stats | capped at 100 | fixed earlier |
| Sidebar "needs attention" badge | 52 | 2,000 |
| Top header "ready to pack" | capped | fixed |
| Customers page (orders + lifetime spend) | 8 customers with history | 400 |

All four now read server-computed figures — `/api/admin/orders/counts` for
the badges, an aggregation inside `/api/users` for customer totals. **Never
derive a store-wide figure by counting a list endpoint's response**; add a
count or an aggregation. `tests/adminScale.test.js` seeds past the limit and
compares every figure against one computed over the whole collection.

## Duplicate requests

Measured on an admin page at 5,000 orders: 12–13 API calls, of which
`/api/roles` was fetched four times and `/api/orders` three. Anything several
components need on the same page goes through `lib/singleFlight.js`
(`lib/adminChrome.js` for order counts and store readiness,
`lib/usePermissions.js`, `lib/useStoreSettings.js`). Admin pages now make 7
calls with no duplicates.

## Adding an API route

`tests/authorizationSweep.test.js` calls every route that changes data —
once with no session, once as an ordinary customer — and requires a 401 or
403. A new route is covered the moment the file exists, so the usual way to
meet it is simply to check the session before doing anything.

Two things to know when it fails on something you added:

- **It is not satisfied by a 400 or a 404.** Those mean the handler did
  work — parsed a body, looked a record up — before deciding whether the
  caller was allowed to ask. Check first, then work.
- **To make a route genuinely public, add it to `PUBLIC` in that file with
  the reason.** Registration, password reset, unsubscribe links and guest
  checkout all live there. The reason is the point: it is what the next
  person reads before deciding whether the exemption still holds.

Anything under `app/api/admin/` is also checked against a signed-in
customer, so an admin route cannot ship with a session check but no
permission check.

## Adding an admin page

Three things in the admin are defined once. Reach for them rather than
pasting a class string from whichever page you had open — that is how the
same text field ended up in fifteen different shapes across twenty pages,
and how the same checkbox ended up with four different tick colours.

- **Text fields, selects and textareas:** `className="admin-input"` plus
  whatever width the layout needs (`w-full`, `flex-1`, `w-20`). The colour,
  border, radius, padding, height, placeholder colour, disabled state and
  focus ring all come from `styles/globals.css`. `admin-input-sm` is the one
  deliberate second size, for a control inside a table row. Do not add
  `rounded-*`, `px-*`, `py-*` or `text-sm` alongside it; those used to be
  the drift.
- **Checkboxes:** `components/admin/ui/Checkbox.jsx`. It carries the 24px
  hit area that WCAG 2.2 asks for, and `label`/`hint`/`compact`/`block`
  cover the shapes the admin actually uses. On/off switches are
  `components/admin/ui/Toggle.jsx`.
- **Status chips:** `components/admin/ui/Badge.jsx`, by `tone`. The tones
  are soft fill plus dark text of the same hue. A bright 500-level fill with
  white text on it reads as more confident and is usually unreadable —
  white on `amber-500` is 2.15:1, on `emerald-500` 2.5:1.
- **Buttons:** `components/admin/ui/Button.jsx`. `variant` is by meaning
  (`primary`, `secondary`, `danger`, `ghost`, `link`, `link-danger`) and
  `size` is `md` or `sm`; `as={Link}` keeps the styling on something that
  navigates. The primary action button used to exist in nine shapes across
  these pages — 32 to 48px tall, two radii, three text sizes, two of them
  gradient-filled.
- **A row of filters with one active:** `components/admin/ui/FilterChips.jsx`
  — Stock history, Restock, Product performance, Abandoned baskets,
  Downloads, Reports and the Notifications delivery log all show the same
  control, and it had grown three different looks.
- **"You may not be here":** `components/admin/ui/PermissionGate.jsx`. It
  knows the difference between still asking, not being allowed, not being
  signed in, and *not having been able to find out* — which is the one the
  admin used to get wrong. A 500 on `/api/roles` made `can()` false for
  everything, so a signed-in owner was told "Access denied — your role does
  not allow this" by thirty pages at once. `usePermissions()` exposes
  `failed` for exactly this; don't treat it as a denial.
- **"We couldn't load this":** `components/admin/ui/ErrorState.jsx`, with a
  retry. Use it instead of letting a failed fetch fall through to the empty
  state.

Colour in the admin comes from `accent` (navy `#2C5282`), not from
Tailwind's palette directly. `indigo` is overridden in `tailwind.config.js`
to the brand navy across the whole ramp; a bare `bg-blue-500` or
`bg-indigo-600` will look like it belongs to a different product.

## Checking the admin's UI

    npm run build && npm start      # one terminal
    npm i -D playwright             # once
    npm run audit:ui                # another terminal

`scripts/ui-audit.mjs` signs in and walks all 26 admin pages at desktop and
phone widths, reporting five things and exiting non-zero on a failure:

- text below the WCAG AA contrast floor, with the measured ratio;
- controls you can tab to that show no visible focus;
- touch targets under 24x24 (WCAG 2.2);
- pages whose document is wider than a 390px phone screen;
- a census of how many distinct text-field and button shapes exist;
- what each page says when its data fails to load.

The census is the one that is not pass/fail. Two field shapes and a handful
of button shapes is a design system; fifteen is drift, and that is what it
was before these components existed. If the number climbs, something is
being hand-rolled again.

The last one breaks every data API on purpose and reads what the page then
shows. The failure it looks for is the quiet one: a page that falls through
to its empty state and says "No orders yet" when the request actually
failed. That is worse than a blank screen, because it is a confident,
specific, wrong answer about the owner's own business, and it looks like
good news. Thirteen pages did this, and the dashboard reported zero orders
and ৳0 revenue for the day.

Two rules that came out of fixing it, worth keeping:

- **`.catch(() => {})` is where this starts.** Swallowing the failure is
  what leaves the page with nothing to distinguish "empty" from "broken".
  Record it.
- **An HTTP 500 that still returns JSON never reaches `.catch`.** The
  project's APIs answer with `{ success: false }`, so `res.success` has to
  be checked too — `if (res.success) setRows(...)` with no `else` is the
  same bug wearing different clothes.

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `BASE_URL` to point it somewhere
other than the defaults, and
`--only=contrast,focus,targets,mobile,controls,states` to run one check.

Re-measure rather than eyeballing. Everything that has actually gone wrong
in this admin — text at 1.3:1, a 16px hit target, five control heights in
one filter row, a page 149px too wide for a phone — was invisible to code
review and obvious the moment something read computed styles in a browser.
The script is also fussy about three traps that each produced a confidently
wrong number the first time: a translucent fill has to be composited before
it is measured, a gradient's colour stops have to be read because
`background-color` on a gradient element is transparent, and anything
inside `transition-all` has to be allowed to settle before it is read.

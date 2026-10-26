// lib/pageTemplates.js
//
// Starting content for the store's information pages. Each one describes
// how THIS store's software actually behaves (so a policy never promises
// something the site doesn't do), and stays neutral on business decisions
// the owner has to make. Owners edit them in Admin → Settings → Pages.
// These are starting points, not legal advice.
//
// {{placeholders}} are filled from store settings; a line whose value isn't
// set is dropped (see lib/simpleMarkdown.js).

export const INFO_PAGES = {
  about: {
    title: "About Us",
    path: "/about",
    description: "Who we are and how we work.",
    template: `## Welcome to {{storeName}}

{{storeName}} is an online store delivering across Bangladesh. We started with a simple idea: shopping online should be easy, honest and reliable.

## Why shop with us

- **Nationwide delivery** — we deliver to all 64 districts.
- **Pay your way** — cash on delivery, and online payment where available.
- **Easy returns** — request a return from your account within {{returnDays}} days of delivery.
- **Real support** — questions go to a real person. [Contact us](/contact) any time.

## Get in touch

- Email: {{storeEmail}}
- Phone: {{storePhone}}
- Address: {{storeAddress}}`,
  },

  privacy: {
    title: "Privacy Policy",
    path: "/privacy-policy",
    description: "What information we collect and how we use it.",
    template: `This policy explains what information {{storeName}} collects when you use this website, and how it is used.

## Information we collect

- **Account details** — your name, email address and password. Passwords are stored in an encrypted (hashed) form; nobody at {{storeName}} can read them.
- **Order details** — delivery addresses, phone numbers and the items you buy, so we can deliver your orders and show your order history.
- **Messages** — anything you send us through the contact form or product questions.
- **Newsletter** — your email address, only if you choose to subscribe.

## Payments

Online payments are processed by our payment partner (SSLCommerz) on their secure payment page. **We never see or store your card number, PIN or banking password.** We only receive confirmation of whether a payment succeeded.

## How we use your information

- To process, deliver and support your orders.
- To send order, payment, delivery and refund updates.
- To send our newsletter — only if you subscribed. Every newsletter includes a link to unsubscribe.
- To keep the site secure, for example by limiting repeated failed sign-in attempts.

## Who we share it with

We share only what is needed:

- **Delivery partners** receive your name, phone number and address to deliver your order.
- **Our payment partner** processes online payments.
- **Our email provider** sends account and order emails on our behalf.

We do not sell your personal information.

## Cookies and browser storage

We use a cookie to keep you signed in, and your browser's storage to remember your cart, your chosen delivery area and products you're comparing. Clearing your browser data removes these.

## Your choices

You can update your name, email and password in your account settings, and unsubscribe from the newsletter at any time. To ask for a copy of your information or to have your account deleted, [contact us](/contact).

## Contact

Questions about this policy: {{storeEmail}}

This policy may be updated from time to time; the latest version is always on this page.`,
  },

  terms: {
    title: "Terms & Conditions",
    path: "/terms",
    description: "The terms that apply when you use this website and place orders.",
    template: `By using this website or placing an order with {{storeName}}, you agree to these terms.

## Your account

You are responsible for keeping your password safe and for activity on your account. Tell us straight away if you think someone else has access to it.

## Products and prices

We work hard to show accurate product details and prices. Prices and availability can change. If a product was listed at a clearly incorrect price, we may cancel the order and will refund anything you have paid.

## Orders

An order is confirmed once you receive an order confirmation. We may decline or cancel an order — for example, if an item becomes unavailable — and will refund any payment in full.

You can cancel an order yourself from **My Orders** while it has not yet shipped and has not been paid online. For orders already paid online, [contact us](/contact) and we'll cancel and refund it.

## Payment

We accept cash on delivery, and online payment where available. Cash on delivery orders must be paid in full when the order is delivered.

## Returns and refunds

Returns are covered by our [Return & Refund Policy](/return-policy).

## Delivery

Delivery is covered by our [Shipping Policy](/shipping-policy).

## Limitation of liability

To the extent allowed by law, {{storeName}} is not liable for indirect or unforeseeable losses. Nothing in these terms limits your rights under the laws of Bangladesh.

## Governing law

These terms are governed by the laws of Bangladesh.

## Contact

{{storeEmail}}`,
  },

  returns: {
    title: "Return & Refund Policy",
    path: "/return-policy",
    description: "How to return an item and how refunds work.",
    template: `We want you to be happy with your order. If something isn't right, here's how returns work.

## Return window

You can request a return within **{{returnDays}} days of delivery**.

## How to request a return

1. Go to **My Orders** in your account.
2. Choose **Request return** on the delivered order.
3. Select the items, tell us why, and submit.

Ordered as a guest, without an account? [Contact us](/contact) with your order number and we'll arrange it for you.

We'll review your request and let you know by email. If it's approved, we'll tell you how to send the item back.

## Condition of returned items

Items should be returned unused, with their original packaging and any accessories, unless they arrived damaged or faulty.

## Refunds

- Your refund is processed once we've received and checked the returned item.
- Online payments are refunded to the original payment method where possible.
- For cash on delivery orders, we'll contact you to arrange the refund.

## Damaged or wrong items

If your order arrived damaged, or you received the wrong item, please request a return and choose that reason, or [contact us](/contact) — we'll put it right.

## Return delivery costs

Who pays for return delivery depends on the reason for the return. We'll confirm this with you before you send anything back.

## Cancelling instead

If your order hasn't shipped yet, you may be able to cancel it instead — see our [Terms & Conditions](/terms).

## Questions

[Contact us](/contact) or email {{storeEmail}}.`,
  },

  shipping: {
    title: "Shipping Policy",
    path: "/shipping-policy",
    description: "Where we deliver, delivery charges and how to track your order.",
    template: `## Where we deliver

We deliver to all 64 districts of Bangladesh.

## Delivery charges and times

Delivery charges and estimated delivery times depend on your area and the delivery option you choose. You'll see the exact charge and estimate at checkout before you place your order.

## Tracking your order

You can follow your order in **My Orders**, or use [Track Order](/track) with your order number and phone number. We also send updates by email as your order moves along.

## Cash on delivery

For cash on delivery orders, please have the full amount ready when your order arrives.

## If a delivery can't be completed

If our delivery partner can't reach you, they may try again or contact you to arrange a new time. Please make sure your phone number and address are correct when ordering.

## Questions

[Contact us](/contact) any time.

- Email: {{storeEmail}}
- Phone: {{storePhone}}`,
  },
};

export const INFO_PAGE_KEYS = Object.keys(INFO_PAGES);

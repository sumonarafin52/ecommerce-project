// lib/registerModels.js
//
// Registers every Mongoose model as soon as the database module loads.
//
// Why: .populate("carrier") etc. needs the referenced model registered in
// the running process, but 13 routes populated models they never imported.
// They only worked when some OTHER page had already loaded that model in
// the same server process — so on a freshly started server (after a deploy,
// or any new serverless instance) the first such request crashed with
// "Schema hasn't been registered". Public order tracking, product reviews,
// checkout and shipping quotes were all affected.
//
// Importing everything here makes that impossible. tests/registerModels
// fails if a new model file is added without being listed below.
import "@/models/Address";
import "@/models/Cart";
import "@/models/CartRecovery";
import "@/models/Category";
import "@/models/DigitalProduct";
import "@/models/Discount";
import "@/models/DownloadGrant";
import "@/models/DownloadLog";
import "@/models/NewsletterSubscriber";
import "@/models/Notification";
import "@/models/NotificationLog";
import "@/models/Order";
import "@/models/PaymentEvent";
import "@/models/PaymentPreference";
import "@/models/Product";
import "@/models/ProductQuestion";
import "@/models/ProductStat";
import "@/models/ReturnRequest";
import "@/models/Review";
import "@/models/RoleConfig";
import "@/models/Settings";
import "@/models/ShippingCarrier";
import "@/models/ShippingMethod";
import "@/models/ShippingZone";
import "@/models/StockAlert";
import "@/models/StockMovement";
import "@/models/SupportTicket";
import "@/models/TaxRate";
import "@/models/TaxZone";
import "@/models/User";
import "@/models/Wishlist";

// ----------------------
// 🛒 Furniture Store POS System — Feature List
// ----------------------

// Very important note:
// We are using the **users** table for login, not Supabase Auth or hashed tokens. Authentication will be done using **plain Supabase email and password**.

// ----------------------
// A. Platform & Security
// ----------------------
/**
 * - Fully web-based, accessible from any browser (desktop, laptop, tablet).
 * - Responsive and touch-friendly UI.
 * - Theme: **Black background, blue/green bordered fields, green save buttons, blue edit buttons, and red delete buttons**.
 * - Data stored in Supabase (PostgreSQL) with Row Level Security (RLS).
 * - User authentication will be done using **users table** for login (plain email/password), not Supabase Auth or hashed tokens.
 * - All sensitive data encrypted in transit and at rest.
 * - Daily automatic database backups with easy restore.
 * - All major tables and reports exportable to Excel and PDF.
 */

// ----------------------
// B. User Roles & Permissions
// ----------------------
/**
 * - Role-based access control (RBAC) using **Supabase email/password-based login**.
 * - Granular permissions: view/add/edit/delete per page/module.
 * - Each user only sees/accesses allowed pages/functions.
 * - User management page for admins to assign roles, manage access, and reset passwords.
 * - Full audit log: all user activity (login, edits, deletions, stock movements, etc.) is tracked and filterable.
 */

// ----------------------
// C. Locations & Stock Management
// ----------------------
/**
 * - Multi-location/outlet support: Unlimited branches/warehouses, all centrally managed.
 * - View, filter, and report stock levels per location.
 * - Stock Entry & Management:
 *    - Opening stock per item/location.
 *    - Closing stock per item/location.
 *    - Manual stock adjustments (with reasons, audit log).
 *    - One-click “Zero Stock to Location” button for full reset or branch opening (with confirmation & logging).
 * - Stock Transfers:
 *    - Move stock between locations, approval workflow if needed, full transfer history per item/location.
 * - Stocktake & Variance:
 *    - Physical stocktake entry and reconciliation.
 *    - Variance report generation for any period/location.
 *    - Last stocktake and next scheduled stocktake per location.
 */

// ----------------------
// D. Product & Catalog Management
// ----------------------
/**
 * - Add/edit/remove products with:
 *    - Name, SKU (auto or manual assignment), description, images, categories, unit of measure.
 *    - Multi-currency pricing per product.
 *    - Standard price and promotional price (each with start/end dates, auto-switch logic, and audit trail).
 * - Combos & Sets:
 *    - Create set/combo products from individual items.
 *    - Manual combo price entry (does not sum components).
 *    - Selling a combo deducts correct qty from each member product.
 * - Category organization and advanced search/filter everywhere.
 */

// ----------------------
// E. POS, Sales, Lay-by & Customer Management
// ----------------------
/**
 * - POS (Point of Sale) Terminal:
 *    - Fast product lookup (name, barcode, SKU).
 *    - Add/remove/edit cart, adjust quantities, apply discounts.
 *    - Select customer (with default currency suggested).
 *    - Currency selection at checkout (auto-converts prices if needed).
 *    - Lay-by (layaway) sales: start, accept partial payments, track due dates/status.
 *    - Multiple payment methods: cash, mobile money, Visa, bank transfer, cheque.
 *    - Print/email branded receipts (with store logo, custom info).
 *    - Print A4 price tags (2 per sheet) with digital stamp and product info.
 *    - Daily sales report: one-click from POS page.
 * - Customers:
 *    - Create/edit/search customers with name, contacts, default currency, and purchase history.
 *    - View payment history, outstanding lay-bys, and balances.
 * - Sales History:
 *    - Full searchable/filterable sales log (date, product, location, user, payment, currency).
 *    - Reprint/email receipts as needed.
 */

// ----------------------
// F. Dashboard, Notifications & Insights
// ----------------------
/**
 * - Main dashboard with live widgets:
 *    - Low stock alerts: Products below minimum, per location, sorted and filterable.
 *    - Pending lay-bys: All overdue/unsettled lay-bys.
 *    - Sales insights: Most sold, least sold, daily/weekly/monthly summaries.
 *    - Quick links: “Transfer Stock”, “Add Sale”, “Print Prices”.
 * - Glossy/glowy widgets, black background with green/red accents.
 * - Central notifications:
 *    - All business-critical alerts (low stock, pending lay-bys, top products) shown on dashboard, not via email/WhatsApp.
 *    - Future: Ready for integration with Android/mobile app (API-ready).
 * - Each page must have a **"Back to Dashboard" button**.
 */

// ----------------------
// G. Reports & Data Export
// ----------------------
/**
 * - Inventory Reports:
 *    - Live stock by product/location (Excel/PDF export).
 *    - Stocktake/variance and transfer/movement logs.
 *    - Filter by product, category, date, or location.
 * - Sales Reports:
 *    - Detailed sales by day, period, product, user, payment type, location, and currency.
 *    - Top/least sold, combo/set breakdowns (Excel/PDF export).
 * - Lay-by Reports:
 *    - Pending, settled, and overdue lay-bys with customer/payment details.
 * - Customer Reports:
 *    - Purchase trends, outstanding balances, repeat customers.
 */

// ----------------------
// H. Utilities & Future-Ready
// ----------------------
/**
 * - Bulk import/export (Excel) for products, stock, combos, and customers.
 * - Central audit log—every action is tracked and filterable.
 * - API endpoints ready for future mobile app integration.
 * - Backup & restore tools for business continuity.
 * - All features extensible: e.g., future WhatsApp, SMS, or mobile alerts.
 * - Serial/Batch Number Tracking (for inventory with warranties or batches).
 * - Expense Tracking Module.
 * - Self-Serve Kiosk Mode.
 */

// ----------------------
// Visual Design & Theme
// ----------------------
/**
 * - **Theme**:
 *    - Black background.
 *    - Blue/green bordered fields.
 *    - Green save buttons.
 *    - Blue edit buttons.
 *    - Red delete buttons.
 *    - Each page should have a **Back to Dashboard button** for easy navigation.
 */

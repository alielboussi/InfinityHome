# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)


When approving a warehouse transfer, a PDF is generated client-side and then:
1. Posted to the serverless function `/api/send-transfer-email` which emails it to:
	- bestrest10@gmail.com
	- alielboussi00@gmail.com
	The subject line format: `Delivery #<transferNumber> - <local date> <local time>`.
2. After emailing, the PDF is uploaded to the Supabase storage bucket `WarehouseTransfers` and the public URL saved in `stock_transfer_sessions.pdf_url` (and metadata/notes JSON).

Configure the following environment variables for email (e.g. in Vercel project settings or a local `.env` file if supported by your dev setup):

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
MAIL_FROM="Best Rest <no-reply@yourdomain.com>"
```

Notes:
* Port 465 implies `secure` (TLS) automatically; other ports (587/2525) use STARTTLS.
* If using a service like SendGrid, Mailgun, or Postmark over SMTP, map the credentials accordingly.
* The function currently has static recipients; adjust `recipients` in `api/send-transfer-email.js` if this should become dynamic.
* Failures to send email are logged but do not block the approval workflow or PDF upload.

#### Example Vercel Environment Variable Settings

Gmail (use an App Password – regular account password will be blocked):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=16_char_app_password
MAIL_FROM="Best Rest <yourgmail@gmail.com>"
```

SendGrid (SMTP relay):
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=YOUR_SENDGRID_API_KEY
MAIL_FROM="Best Rest <no-reply@yourdomain.com>"
```

Mailgun (EU region example – adjust domain/region):
```
SMTP_HOST=smtp.eu.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=mailgun_smtp_password
MAIL_FROM="Best Rest <no-reply@yourdomain.com>"
```

Postmark:
```
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=POSTMARK_SERVER_TOKEN
SMTP_PASS=POSTMARK_SERVER_TOKEN
MAIL_FROM="Best Rest <no-reply@yourdomain.com>"
```

SparkPost:
```
SMTP_HOST=smtp.sparkpostmail.com
SMTP_PORT=587
SMTP_USER=SMTP_Injection
SMTP_PASS=YOUR_SPARKPOST_API_KEY
MAIL_FROM="Best Rest <no-reply@yourdomain.com>"
```

If you need to test locally without a real provider, you can use [Ethereal Email](https://ethereal.email/) temporary credentials; the messages won't deliver to real inboxes but you can view them in Ethereal's web UI.

## Transfer PDF Delivery

WhatsApp delivery has been removed. Approved transfers are delivered via email using the `/api/send-transfer-email` serverless function. Configure SMTP credentials in your project environment (see the SMTP section above). Optional multi-channel delivery can be re-introduced in the future.



### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

## Canonical Finance Rules (Sales/Layby)

The app and PDFs share a single source of truth for financials via canonical Postgres views:

- v_sales_totals_canonical: per-sale total computed from line items minus discounts, with schema-fallback for legacy fields.
- v_payments_non_credit: sums payments per sale excluding credit-like types; includes down_payment rows.
- v_sales_financials_canonical: joins totals + non-credit payments to yield total, paid, outstanding per sale.
- v_sales_financials: alias to v_sales_financials_canonical used by the UI.

Rules:
- Paid excludes any credit-type payments; down_payment counts as paid.
- Totals are itemized (sum of line qty*price) minus discount; do not rely on legacy aggregate fields.
- Customer-level rollups sum per-sale canonical values.

## Database Cleanup & Verification

The repo includes SQL to preview, drop unused public objects, verify, and index safely:

- supabase/sql/preview_drop_unused_objects.sql
	- Lists public tables/views not referenced by the app (whitelist derived from code).
	- Outputs commented DROP statements for review.

- supabase/sql/drop_unused_objects.sql
	- Drops all non-whitelisted public tables/views via a DO block. Run only after preview.

- supabase/sql/post_cleanup_verification.sql
	- Confirms legacy objects are gone, canonical views exist, sanity-selects work, and checks for orphan rows.

- supabase/sql/create_indexes_safe.sql
	- Creates performance indexes only when the referenced columns exist (avoids errors on missing created_at).

Recommended sequence:
1. Run preview_drop_unused_objects.sql and review results.
2. Run drop_unused_objects.sql (optional, if you want full cleanup) or selectively drop specific objects.
3. Ensure v_sales_financials alias exists:
	 - create or replace view public.v_sales_financials as select * from public.v_sales_financials_canonical;
4. Run post_cleanup_verification.sql and confirm orphan counts are zero.
5. Run create_indexes_safe.sql for performance.

## Duplicate Receipt Numbers (Scoped)

To allow duplicate `receipt_number` values only for a specific customer (Fahme), run the SQL in
`scripts/sql/allow_duplicate_receipts.sql` in the Supabase SQL editor (or `psql`).

What it does:
- Drops any existing global unique constraint/index on `sales.receipt_number`.
- Creates a partial unique index that enforces uniqueness for all customers except the UUID
	`d8e756ae-b8ea-4f90-b99a-70c1120f52b9`.
- Trims existing `receipt_number` values to avoid whitespace duplicates.

Notes:
- The frontend does not enforce uniqueness; the database-level partial index protects everyone else.
- If you later need to change the UUID, edit the SQL and re-run (it is idempotent for the provided names).

## Code Hygiene

- scripts/scan-unused-files.js can detect unused JS files from src/index.js.
- npm run scan:unused (preview) / npm run scan:unused:rename (append .delete.js) can help keep the codebase clean.

## Layby Architecture (Normalized Allocation Batching)

### Overview
Layby (lay-by) statements are now produced via a single Postgres RPC function `get_layby_statement` that returns:

```
{ layby: {...}, sales: [...], items: [...], payments: [...] }
```

Payments that originate from a pooled / multi-sale allocation are grouped by `allocation_batch_uuid` (column on `sales_payments`). Legacy note token parsing (e.g. `ALLOC:<uuid>` inside `sales_payments.notes`) has been removed after migration backfilled the UUID column and stripped tokens.

### Feature Flag
The front-end decides whether to use the RPC via environment variable:

```
REACT_APP_USE_LAYBY_RPC=true
```

If unset, it defaults to `true` (can be flipped to `false` to fall back to legacy multi-query logic if reintroduced). See `src/laybyStatementService.js`.

### Parity Script
To validate that RPC output matches legacy logic for a given layby:

```
node scripts/laybyParityCheck.js <customer_uuid> <layby_uuid>
```

The script compares payment arrays (normalized + sorted). A non-zero exit code indicates a structural difference.

### Allocation Grouping Rules (PDF)
1. Group by `allocation_batch_uuid` when present.
2. Otherwise, heuristic fallback groups consecutive payments with identical date (day), type, reference, and normalized note.
3. Legacy ALLOC token grouping is retired; if any lingering token appears a console warning is emitted.

### Synchronizing `laybys.paid_amount`
The column `laybys.paid_amount` is now maintained by triggers defined in migration:

`supabase/migrations/2025-10-08_layby_paid_amount_triggers.sql`

Triggers fire AFTER INSERT/UPDATE/DELETE on `sales_payments` and recompute the paid sum for the associated layby (via `sale_id`). If future pooling introduces multi-sale laybys, extend the function accordingly.

### Future Hardening (Optional)
- Replace UI references to stored `paid_amount` with a computed view (then drop the column) once triggers have proven stable.
- Introduce RLS policy tests ensuring only authorized users can read payments and invoke the RPC.
- Consider materialized view caching if RPC latency becomes a bottleneck on large datasets.

### Quick Verification Queries
Residual legacy tokens (should return zero rows):
```
SELECT notes FROM sales_payments WHERE notes ILIKE 'ALLOC:%' LIMIT 1;
```
Confirm trigger updates (insert a tiny test payment and inspect `laybys.paid_amount`).


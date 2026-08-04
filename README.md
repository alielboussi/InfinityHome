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
2. After emailing, the PDF is uploaded to the Firebase Storage bucket `WarehouseTransfers` and the public URL saved in `stock_transfer_sessions.pdf_url` (and metadata/notes JSON).

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

The app and PDFs share a single source of truth via `src/utils/saleFinancials.js` (`computeSaleFinancials`, `buildFinancialsMap`), loading `sales`, `sales_items`, and `sales_payments` from Firestore.

Rules:
- Paid excludes any credit-type payments; down_payment counts as paid.
- Totals are itemized (sum of line qty*price) minus discount; do not rely on legacy aggregate fields.
- Customer-level rollups sum per-sale canonical values.

## Database Cleanup & Verification

The app now runs on **Firebase Firestore**. Legacy Postgres SQL cleanup scripts were removed during the Firebase migration.

- Schema alignment notes: see `SCHEMA_ALIGNMENT.md`
- Firestore security rules: `firestore.rules`
- Backups: `/api/db-backup` (Firebase Admin export)

Recommended checks before decommissioning legacy infrastructure:
1. Verify `/api/health` reports `"backend": "firestore"`.
2. Spot-check sales, layby, inventory, and transfer flows in production.
3. Confirm product/company images load from `firebasestorage.googleapis.com`.

## Duplicate Receipt Numbers (Scoped)

To allow duplicate `receipt_number` values only for a specific customer (Fahme), enforce the rule in application logic and/or Firestore data validation. The legacy Postgres partial unique index is no longer used.

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
Layby statements are built from Firestore collections (`laybys`, `sales`, `sales_items`, `sales_payments`, `layby_payments`) via `src/laybyStatementService.js` and canonical totals from `src/utils/saleFinancials.js`.

Payments that originate from a pooled / multi-sale allocation are grouped by `allocation_batch_uuid` (column on `sales_payments`). Legacy note token parsing (e.g. `ALLOC:<uuid>` inside `sales_payments.notes`) has been removed after migration backfilled the UUID column and stripped tokens.

### Client implementation
Layby statements are loaded entirely in the browser/server via Firestore queries. See `src/laybyStatementService.js`.

### Allocation Grouping Rules (PDF)
1. Group by `allocation_batch_uuid` when present.
2. Otherwise, heuristic fallback groups consecutive payments with identical date (day), type, reference, and normalized note.
3. Legacy ALLOC token grouping is retired; if any lingering token appears a console warning is emitted.

### Synchronizing `laybys.paid_amount`
Paid totals are computed in application code (`saleFinancials`, layby services) from `sales_payments` / `layby_payments`. Keep `laybys.paid_amount` in sync when writing payments if the column is still used in UI filters.

### Future Hardening (Optional)
- Replace UI references to stored `paid_amount` with computed totals from `saleFinancials` once verified stable.
- Add Firestore security rule tests for payment reads and layby mutations.
- Consider caching heavy layby statement queries if latency grows on large datasets.

### Quick verification
- Search Firestore `sales_payments` for notes starting with `ALLOC:` (should be none after migration).
- After a test payment, confirm layby paid totals match `saleFinancials` output in the UI.


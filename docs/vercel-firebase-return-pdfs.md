# Vercel: Firebase Storage for return delivery notes (CR/WHR)

Customer return labels embed a QR link to a hosted PDF. Upload uses the same Firebase Admin setup as warehouse delivery driver signatures.

## Required Vercel environment variables

Set on the **production** project (same as other warehouse APIs):

| Variable | Purpose |
|----------|---------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON service account (or use `FIREBASE_SERVICE_ACCOUNT_PATH` locally only) |
| `FIREBASE_STORAGE_BUCKET` | e.g. `bestrest-portal-system-43108.firebasestorage.app` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Same bucket (fallback in `firebaseStorage.js`) |

## Storage path

- Folder: `warehouse-return-delivery-notes/{session_id}.pdf`
- Public URL pattern: `firebaseStoragePublicUrl` in `server/lib/firebaseStorage.js`
- Upload: `uploadWarehouseReturnDeliveryNotePdf` in `server/lib/warehouseReturnDeliveryNoteStorage.js`

## When upload runs

- **CR / customer delivery submit** (`return-order-customer-delivery-submit`) — server builds or accepts PDF base64, then uploads before label print.
- **Workshop repair dispatch** uses the same submit ops after driver signature (`RepairReturnSignature` screens).

If upload fails, labels still print but **QR may be empty** until Storage is configured and submit is retried.

## Firebase console

1. Storage → Rules: allow public read on `warehouse-return-delivery-notes/**` (or signed URLs if you change strategy).
2. Service account needs **Storage Admin** or object create on the bucket.

## Local test

With `.env.local` service account + bucket, submit a test CR from an upholstery/carpentry/painting repair flow and confirm the PDF object appears in Firebase Storage.

# Schema ↔ Code Alignment Report

Last updated: 2025-11-07

Purpose: document observed mismatches between the application code and the Firestore data model (migrated from legacy Postgres), plus safe remediation options.

## Confirmed alignments

- Customers data model: code consistently uses `customers.credit_balance` (read in POS, Customers, Layby components and API).
- Sale financials: computed in-app via `src/utils/saleFinancials.js` (`computeSaleFinancials`) from `sales`, `sales_items`, `sales_payments` (legacy Postgres views removed).
- Checkout flow: API `api/checkout.js` inserts into `sales`, `sales_items`, `sales_payments` and is working against current schema (smoke-tested previously).

## Potential mismatches

1) RPC name difference for ad-hoc SQL
  - Code usage: prior ad-hoc SQL probes attempted `exec_sql`.
  - Schema reality: Some environments expose `execute_sql` instead.
  - Risk: Low (diagnostic-only). Previous probes already had catalog fallbacks.
  - Action taken: Added fallback logic to try `exec_sql` then `execute_sql`, else emit helpful error.

2) Customer advance vs credit balance
   - Code usage: only `credit_balance` is used in the app.
   - DB legacy: older functions may reference `customers.advance_balance` (not observed in repo files; might exist in DB).
   - Risk: Medium only if legacy DB functions are still invoked; otherwise benign.
   - Proposed options (choose one):
     a) Deprecate legacy functions referencing `advance_balance` and refactor them to `credit_balance`.
     b) Add a generated column `advance_balance` as an alias of `credit_balance` (read-only) to keep legacy functions from erroring.
     c) If legacy functions try to update `advance_balance`, prefer (a) over (b) since generated columns are not writable.

3) Unused checkout finalizers
   - Code usage search: no references to `pos_finalize_checkout*` functions.
   - Risk: Low. They can remain or be deprecated for clarity.
   - Proposed action: add `COMMENT ON FUNCTION ... IS 'Deprecated: not used by app';` and optionally schedule removal after a grace period.

  4) Missing auto-generation for sales_items.id
    - Symptom: `null value in column "id" of relation "sales_items" violates not-null constraint` during checkout item inserts.
    - Cause: `public.sales_items.id` defined NOT NULL without identity/default in some environments.
    - Impact: Checkout fails after header insertion; payments never inserted.
    - Remediation (Firestore): ensure checkout assigns document IDs / numeric IDs via server logic (`api/checkout.js`, `firestoreCheckout.js`) so `sales_items.id` is always set.
    - Follow-up: Verify auto-generation by inserting a test row or running a checkout in a sandbox.

4) Missing auto-generation for `sales.id`
  - Symptom: Runtime error `null value in column "id" of relation "sales" violates not-null constraint` during checkout.
  - Cause: `public.sales.id` defined NOT NULL without `DEFAULT nextval(...)` or `GENERATED AS IDENTITY`; frontend inserts omit `id` expecting server assignment.
  - Impact: Sale header insert fails; downstream item/payment inserts never run.
  - Remediation (Firestore): checkout uses server-assigned IDs; verify in sandbox that `sales.id` is populated on insert.

## Recommended remediation plan

- Phase 1 (no-risk):
  - Verify checkout and sales edit flows assign IDs correctly in Firestore.
  - Remove or archive legacy Postgres-only notes from this document as migration completes.

- Phase 2 (targeted cleanup):
  - If any legacy `advance_balance` fields remain in Firestore documents, map them to `credit_balance` in a one-time data fix.

## Validation

- Grep the codebase for `advance_balance` and `pos_finalize_checkout`; remove dead references.
- Run production smoke tests on checkout, layby statements, and customer totals.

## Notes

- This document doesn’t change runtime behavior; it’s a guide for ongoing schema hygiene and future patches.

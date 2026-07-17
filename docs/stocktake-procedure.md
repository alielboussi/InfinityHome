# How to Run a Successful Stocktake

This guide explains the **procedure** for a stocktake: who does what, in what order, and what “done” means. It does not cover technical APIs or system internals.

---

## What a stocktake is

A stocktake resets the recorded stock for **one location** to what was actually counted on the floor.

- Only that location’s stock is updated.
- Other locations are left alone.
- Counts from everyone working that location are combined before the final submit.
- Until someone submits from the control page, inventory and stock periods do **not** change.

---

## Two pages, two roles

| Role | Page | Job |
|------|------|-----|
| **Control operator** | Stocktake control (`/stocktake`) | Choose location, open/close the session, import Excel if needed, watch live totals, clear mistakes, **submit** the final result |
| **Counter** | Count page (`/stocktake/count`) | Sign in, join the open location session, count products and sets, optionally import their own Excel |

Counters never submit inventory. Control never needs to stand on the floor with a scanner — but both can import Excel.

**Tip:** Keep the count page URL bookmarked. It does not change per session. When control starts counting for a location, that location appears automatically for counters.

---

## Before you start

1. Agree which **location** you are counting.
2. Confirm products (and sets, if used) are enabled for that location in the product catalogue.
3. Decide who is control and who is counting.
4. Have counters ready on the count page (signed in).
5. If this is the **first** stocktake for that location, submit will create the opening stock and start the first open period. Later stocktakes close the current period and open the next one.

Only **one** open counting session is allowed per location at a time. Different locations can count at the same time.

---

## Recommended procedure

### Step 1 — Control opens the session

1. Open **Stocktake control**.
2. Select the location.
3. Click **Start counting**.

The location is now open for counting. Counters should see it on the count page within a few seconds.

If you started the wrong location and **nobody has counted yet**, use **Close session**. That cancels the empty session with no stock changes.

### Step 2 — Counters count on the floor

On the count page:

1. Sign in (Google or email/password).
2. Confirm the correct **location** (if more than one session is open, pick the right one).
3. Search or scan a product or set.
4. Enter the quantity found.
5. Repeat until the area is done.

**Products** — each add increases that counter’s running total for that product.

**Sets** — counting a set adds its **component** quantities (bill of materials). The cart shows components, not a single set line. Live totals on control can still show how many complete sets those components imply.

**Sign out** only ends the counter’s login on that device. It does **not** wipe their counts. Counts stay with the open session until control submits (or clears them).

**Clear my cart** (counter) removes only that person’s counts for the session. Other counters are unaffected.

### Step 3 — Optional Excel import

You can import quantities from a spreadsheet on **control** or on the **count page**.

Required columns:

- **SKU**
- **Product Name**
- **Quantity**

Rules:

- Products / components only — **sets are not imported**.
- Match by SKU first, then product name.
- Only products enabled for the **session location** are accepted.
- Import sets that user’s quantities for those products (absolute values for the importing user), it does not change other locations.

Download the **Sample** file for the location when you need the expected layout.

### Step 4 — Control reviews live totals

On control, watch **Live totals** while counting continues.

- Totals combine every counter’s work for the location.
- Sets may appear as complete sets derived from components (and from set scans where used).
- Expand rows when you need to see components or who counted what.

If the session is badly wrong, use **Clear counts** on control. That wipes **everyone’s** counts for this session but keeps the session open so you can start again.

### Step 5 — Control submits

When counting is finished and live totals look correct:

1. Confirm you still have the right location selected.
2. Click **Submit** and confirm.

What submit does (in plain language):

- Writes the final counted quantities into **inventory for that location only**.
- Any product linked to that location (or already on inventory there) that **nobody counted** is set to **quantity 0**.
- Closes the counting session so counters can no longer add to it.
- Updates stock **periods** for that location:
  - **First stocktake** for the location → opens the first period with these quantities as opening stock.
  - **Later stocktakes** → closes the current period with these quantities as closing stock, then opens the next period with the same quantities as its opening stock.
- On later (rollover) submits, a variance PDF for the closed period may download automatically.

After submit, inventory elsewhere is unchanged. Historical count detail is kept for audit; the floor session itself is finished.

---

## First stocktake vs later stocktakes

| | First stocktake for a location | Later stocktake |
|--|--------------------------------|------------------|
| Purpose | Establish opening stock and start the first open period | Re-count, close the period, open the next |
| After submit | Location is marked as having completed its initial stocktake | Periods roll forward for that location |

Always treat each submit as final for that session. Do not submit until the floor count is complete.

---

## What to do when something goes wrong

| Situation | What to do |
|-----------|------------|
| Wrong location opened, no counts yet | **Close session** on control |
| Wrong counts, want a clean restart | **Clear counts** on control (session stays open) |
| One counter entered bad numbers | That person uses **Clear my cart** or removes the bad line; others keep theirs |
| Counter signed out by mistake | Sign in again — their counts are still in the session |
| Product missing from search | Create the product (or set) from the count page for that location, or fix location enablement in the catalogue, then count it |
| Need to stop without changing stock | Do **not** submit. Close only if empty; otherwise clear or leave the session open until you are ready |

---

## Success checklist

Use this before you submit:

- [ ] Correct location is open and selected on control  
- [ ] All counters finished their areas  
- [ ] Live totals match what you expect on the floor  
- [ ] Excel imports (if any) were checked for skips / wrong SKUs  
- [ ] Uncounted items at this location are intentionally going to **zero**  
- [ ] Nobody else needs to add more counts  
- [ ] You are ready to update inventory and periods for **this location only**

Then submit from control.

---

## After a successful stocktake

1. Confirm the session shows as submitted / no longer counting.
2. Confirm inventory for that location reflects the count.
3. For a rollover, keep the variance PDF if it downloaded.
4. Review periods on the control page if you need opening/closing history.
5. Counters can leave the count page; the next stocktake will appear when control starts a new session.

---

## Quick reference — who changes stock?

| Action | Changes inventory? | Changes periods? |
|--------|--------------------|------------------|
| Start counting | No | No |
| Add / import counts | No | No |
| Clear my cart / clear all counts | No | No |
| Close empty session | No | No |
| **Submit** | **Yes — this location only** | **Yes — this location only** |

Counts only become official stock when control **submits**.

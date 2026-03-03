# Feature Spec: Product Database Mock

## Overview

Extend the Sales Coach demo with a frontend-only product database that is included in every `/api/analyze` call. Claude uses the product list to produce a structured **Order Overview** (with line-item calculations), a **Meeting Summary**, and a **Red Flags** section highlighting objections, unknown products, and missing follow-up dates.

No backend persistence — all product state lives in the browser.

---

## User Stories

### US-6: Product Database Tab

**As a** salesperson using the demo,
**I want to** view and edit a list of products in a separate tab,
**So that** I can configure which products are available for analysis without touching code.

**Acceptance criteria:**
- A "Product Database" tab is visible alongside the "Sales Coach" tab in the header area
- Clicking the tab shows a panel with an editable table; all other content is hidden
- The table displays columns: SKU, Name, Price, Unit, Category, Delete
- Each cell in a row is an `<input>` that updates the in-memory product state on `oninput`
- An **+ Add Product** button appends an empty row; the user can fill it in
- A **Reset to Defaults** button replaces the product list with the 3 default candy products
- Switching between tabs preserves product edits — nothing is lost on tab change
- "Start Over" resets only the Sales Coach flow (phases 1–3); products are not affected

---

### US-7: Products Sent with Analysis

**As a** backend analyst prompt,
**I want to** receive the current product database alongside the transcript,
**So that** Claude can match spoken product names to the catalogue.

**Acceptance criteria:**
- The `POST /api/analyze` request body includes a `products` array alongside `transcript`
- Each product object has shape: `{ sku, name, price, unit, category }`
- `price` is a number (float); all other fields are strings
- If the product list is empty, the request still succeeds (Claude handles gracefully)
- Backend validates via Pydantic; invalid payloads return HTTP 422

---

### US-8: Order Overview in Meeting Output

**As a** sales manager reviewing the output,
**I want to** see a structured order table with calculated totals,
**So that** I can immediately understand the deal value.

**Acceptance criteria:**
- Phase 2 output contains an **## Order Overview** section as the first section
- The section renders as a markdown table with columns: SKU, Product, Qty, Unit Price, Line Total
- Line totals are calculated by Claude as `price × quantity` from the product database
- If quantity is not mentioned for a product, Claude writes "not specified" in the Qty column and leaves Line Total blank
- A **Total Deal Value** bold line appears below the table summing all calculable line totals
- Currency is indicated (SEK or as mentioned in transcript)
- Products mentioned by name/category but not matching any database entry are still listed with a note

---

### US-9: Red Flags & Notes

**As a** sales coach,
**I want to** see highlighted warnings in the meeting output,
**So that** I can focus coaching on the most critical gaps.

**Acceptance criteria:**
- Phase 2 output contains a **## Red Flags & Notes** section as the third section
- Each flag is a bullet prefixed with ⚠️
- The following conditions are flagged when present:
  - Customer expressed hesitation, objection, or price resistance
  - Any product name mentioned in the transcript does not appear in the product database
  - No follow-up date or next step was agreed upon during the meeting
- If none of the above are detected, the section reads: "No red flags identified."

---

## Product Schema

```json
[
  { "sku": "LAK-001", "name": "Lakerol",        "price": 15.90, "unit": "pack", "category": "Pastilles" },
  { "sku": "KEX-001", "name": "Kex Choklad",    "price": 12.50, "unit": "bar",  "category": "Chocolate" },
  { "sku": "SKP-001", "name": "Skippers Pipes", "price": 18.90, "unit": "bag",  "category": "Candy"     }
]
```

---

## UI Layout

### Tab navigation (below header)

```
┌─────────────────────────────────────────────┐
│  🎙 Sales Coach                [Start Over]  │
├──────────────────┬──────────────────────────┤
│  Sales Coach  ●  │  Product Database         │
├──────────────────┴──────────────────────────┤
│  (existing phases 1–3  OR  product table)    │
└─────────────────────────────────────────────┘
```

- Active tab has a bottom border highlight (primary color)
- Inactive tab has muted text
- Tab bar is full-width, flush with header

### Product Database tab

```
┌─────────────────────────────────────────────────────────────────┐
│  SKU        Name             Price    Unit    Category   [Del]  │
├─────────────────────────────────────────────────────────────────┤
│ [LAK-001]  [Lakerol       ] [15.90] [pack] [Pastilles]  [ × ]  │
│ [KEX-001]  [Kex Choklad   ] [12.50] [bar ] [Chocolate]  [ × ]  │
│ [SKP-001]  [Skippers Pipes] [18.90] [bag ] [Candy     ]  [ × ]  │
├─────────────────────────────────────────────────────────────────┤
│  [+ Add Product]                     [Reset to Defaults]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 2 Output Structure

Claude must return **exactly three sections** in this order:

```markdown
## Order Overview
| SKU      | Product        | Qty | Unit Price | Line Total |
|----------|----------------|-----|------------|------------|
| KEX-001  | Kex Choklad    | 100 | 12.50 SEK  | 1,250 SEK  |
| LAK-001  | Lakerol        | 50  | 15.90 SEK  | 795 SEK    |
**Total Deal Value: 2,045 SEK**

## Meeting Summary
[Narrative summary of the meeting: customer, topics, outcomes.]

## Red Flags & Notes
- ⚠️ Customer expressed hesitation about pricing
- ⚠️ "Premium Lakerol XL" not found in product database
- ⚠️ No follow-up date or next step was mentioned
```

---

## Technical Design

### Frontend changes

| File | Change |
|---|---|
| `static/index.html` | Tab bar HTML, `#tab-coach` wrapper, `#tab-products` panel |
| `static/app.js` | `DEFAULT_PRODUCTS`, `products` state, `renderProductTable()`, `addProduct()`, `resetProducts()`, tab switching, updated `analyzeTranscript()` |
| `static/style.css` | `.tab-bar`, `.tab`, `.tab.active`, `.products-panel`, `.products-table`, `input` inside cells |

### Backend changes

| File | Change |
|---|---|
| `main.py` | `Product` Pydantic model, `TranscriptRequest.products: list[Product] = []`, updated `ANALYZE_SYSTEM_PROMPT` |

### API contract

**Request:**
```json
POST /api/analyze
{
  "transcript": "string",
  "products": [
    { "sku": "KEX-001", "name": "Kex Choklad", "price": 12.50, "unit": "bar", "category": "Chocolate" }
  ]
}
```

**Response (unchanged):**
```json
{ "markdown": "## Order Overview\n..." }
```

---

## Claude Prompt (ANALYZE_SYSTEM_PROMPT)

```
You are a sales meeting analyst for a candy distribution company.
You have access to the company's product database (provided below as JSON).

Given a spoken transcript of a salesperson describing their meeting, produce a structured markdown document with exactly these three sections in this order:

## Order Overview
Extract all products, quantities, and pricing discussed. Match product names to the database by name or SKU.
Calculate line totals (price × quantity) and a Total Deal Value.
If a quantity is not mentioned for a product, write "not specified" in the Qty column.
Format as a markdown table: SKU | Product | Qty | Unit Price | Line Total
After the table, add a bold line: **Total Deal Value: X SEK** (omit if no quantities are specified).
If a product is mentioned but not in the database, include it in the table with SKU = "UNKNOWN".

## Meeting Summary
A concise narrative summary of the meeting: who was met, what was discussed, outcomes agreed, tone of the conversation.

## Red Flags & Notes
Use bullet points with ⚠️ prefix. Flag these issues if present:
- Any product mentioned in the transcript that does not appear in the product database (by name or SKU)
- Any customer objection, hesitation, or price resistance
- No follow-up date or next step was agreed upon
If none of the above are detected, write: "No red flags identified."

Product Database (JSON):
{product_json}

Be concise and professional. If information is missing, note it as "Not mentioned."
```

---

## Implementation Phases

### Phase 1 — Spec (this document)
Write and review `specs/features/product-database-mock.md`.

### Phase 2 — Tab navigation
Add `.tab-bar` with two tabs in `index.html`. Add tab switching logic and CSS. Wrap existing phases in `#tab-coach`.

### Phase 3 — Product database tab
Add `#tab-products` panel in `index.html`. Implement `DEFAULT_PRODUCTS`, `products`, `renderProductTable()`, `addProduct()`, `resetProducts()` in `app.js`. Add table + input styles in `style.css`.

### Phase 4 — Backend update
Add `Product` model to `main.py`. Update `TranscriptRequest`. Inject `product_json` into Claude prompt.

### Phase 5 — Wire up frontend fetch
Update `analyzeTranscript()` to include `products` in request body.

---

## Verification Checklist

- [ ] Two tabs render correctly; active state toggles on click
- [ ] Product table renders 3 default rows; inline edits update state
- [ ] Add Product appends an empty row; Reset returns to defaults
- [ ] Sales Coach tab: record → analyze sends `products` in request body (check browser DevTools Network tab)
- [ ] Phase 2 output shows all three sections: Order Overview table, Meeting Summary, Red Flags
- [ ] Editing a product price before recording updates the calculated line total in the output
- [ ] Mentioning an unknown product triggers a Red Flag
- [ ] No follow-up date triggers a Red Flag
- [ ] `curl` test returns correct markdown (see below)

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Met with ICA, they want 100 Kex Choklad bars. Price seemed high to them.",
    "products": [
      {"sku": "KEX-001", "name": "Kex Choklad", "price": 12.50, "unit": "bar", "category": "Chocolate"}
    ]
  }' | python3 -m json.tool
```

Expected: markdown with Order Overview (100 × 12.50 = 1,250 SEK), Red Flag for customer price hesitation, Red Flag for no follow-up date.

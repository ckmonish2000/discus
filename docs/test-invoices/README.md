# Test invoices

Seven fixtures for exercising the extraction pipeline end to end. Generated
locally rather than downloaded, so each one targets a specific behaviour and
the correct answer is known.

Upload through the dashboard (Documents → Upload invoice) or drop them into
the `invoices` MinIO bucket.

| File | Currency | What it tests |
|---|---|---|
| `01-acme-gbp-clean.pdf` | GBP | The happy path. Every core field present: number, both dates, PO, VAT ID, two line items, subtotal/tax/total. |
| `02-nordwind-eur-european-format.pdf` | EUR | European decimals (`1.250,00`) where `.` is the thousands mark and `,` the decimal. German field labels. |
| `03-contoso-usd-discount.pdf` | USD | A discount line, five line items, sub-cent unit prices (`$0.384`), and US `MM/DD/YYYY` dates. |
| `04-sharma-inr.pdf` | INR | Indian lakh grouping (`₹2,38,500.00`) — irregular digit groups. Split CGST/SGST rather than one tax line. |
| `05-sakura-jpy-zero-decimal.pdf` | JPY | Zero-decimal currency. `¥698,500` is 698500 minor units, not 69850000 — the divisor must resolve to 1. |
| `06-handwritten-style-sparse.pdf` | GBP | Sparse tradesman invoice: no tax, no due date, no VAT ID, no PO. Should extract what exists and flag `needsReview`. |
| `07-scanned-invoice-image.png` | GBP | An image, so anydoc rejects it and the Mistral OCR fallback runs instead. |

## Expected totals

Check these against what lands in the dashboard.

| File | Subtotal | Tax | Total |
|---|---|---|---|
| 01 | 1,800.00 | 360.00 | **2,160.00** |
| 02 | 4,520.00 | 858.80 | **5,378.80** |
| 03 | 877.62 | 68.11 (less 87.76 discount) | **857.97** |
| 04 | 238,500.00 | 42,930.00 | **281,430.00** |
| 05 | 635,000 | 63,500 | **698,500** |
| 06 | — | — | **975.60** |

## Notes

- 05 is the one worth watching. Money is stored as `BIGINT` minor units, and
  JPY has no minor unit — `¥698,500` must persist as `698500n`. A wrong
  divisor shows up as a 100x error.
- 06 has no tax and no due date on purpose. Missing fields should produce
  mapping issues and set `needsReview`, not fail the extraction.
- 07 needs `MISTRAL_API_KEY` set; the others only need `GOOGLE_API_KEY`.

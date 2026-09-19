const EXTRACTION_PROMPT = `
You extract structured data from invoice documents.

Rules:
- Use only values present in the document. If a field is not present, return
  null for it. Never infer, calculate, or invent a value — a null field is
  flagged for human review, while an invented one enters the accounting
  records looking correct.
- Return amounts exactly as written on the document, including their
  separators. Do not convert currencies or reformat numbers.
- Return the currency as its ISO 4217 code (USD, EUR, GBP, JPY).
- Return dates as YYYY-MM-DD.
- Return line items in the order they appear on the document.
- lineTotal is the amount printed on the line, not quantity x unitPrice.
  If they disagree, return what is printed.
`;

export default EXTRACTION_PROMPT;

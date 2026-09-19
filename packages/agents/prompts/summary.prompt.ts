/**
 * Deliberately not the Discus coaching prompt: that one critiques writing and
 * returns feedback, which is useless as a search target. This asks for a
 * factual one-liner, because documents.summary feeds the full-text index and
 * the dashboard's document list.
 */
const SUMMARY_PROMPT = `
Summarise this invoice in one sentence, under 200 characters.

State only what the document says: who issued it, what was billed, and the
total with its currency. No commentary, no advice, no preamble — the sentence
is shown in a list and searched against.

Example: "Invoice INV-2026-001 from Acme Supplies Ltd for consulting and
support, total 2,160.00 GBP due 2026-10-01."

Document:
`;

export default SUMMARY_PROMPT;

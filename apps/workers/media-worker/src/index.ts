import { env } from 'common'
import './workers/image.worker'
import './workers/video.worker'
import './workers/document.worker'

/**
 * The spec asked for a startup failure when GOOGLE_API_KEY is absent, but the
 * env schema cannot require it: loadEnv() runs at import time in every process
 * — the API, the tests, and the coaching pipeline included — and none of those
 * need a Gemini key. Requiring it there would stop the whole repo booting.
 *
 * So the check lives where the key is actually used. Without it a misconfigured
 * deployment looks healthy and fails per document, burning three BullMQ
 * attempts and a MinIO download each time before surfacing the reason as a
 * toast.
 */
if (!env.llm.GOOGLE_API_KEY) {
  console.warn(
    '[worker] GOOGLE_API_KEY is not set — invoice extraction will fail for ' +
      'every document. Set it in .env.local before uploading invoices.',
  )
}

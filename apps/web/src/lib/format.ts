/**
 * The API already converts minor units to decimals in the invoice's own
 * currency, so the client only has to present them.
 */
export const money = (amount: number | null, currency: string) =>
  amount === null
    ? '—'
    : new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(amount)

export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export const fileSize = (bytes: number | null) => {
  if (bytes === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

/** Extracts a readable filename from an object path. */
export const fileName = (objectPath: string) =>
  objectPath.split('/').pop() || objectPath

// Shared due-date helpers.
//
// Cards store due dates as date-only strings ('YYYY-MM-DD'). They must always
// be parsed as local calendar days: `new Date('YYYY-MM-DD')` parses as UTC
// midnight, which shifts the rendered day in timezones behind UTC and makes
// "due today" look overdue. Every view (board list, card detail) must use
// these helpers so the same stored value renders identically everywhere.

const DUE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Parse a date-only string into a local Date, or null when missing/invalid.
export function parseDueDate(dateStr) {
  if (typeof dateStr !== 'string') return null
  const m = DUE_DATE_RE.exec(dateStr.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return d
}

export function isValidDueDate(dateStr) {
  return parseDueDate(dateStr) !== null
}

// A card is overdue only once its due day has fully passed.
export function isDueOverdue(dateStr) {
  const due = parseDueDate(dateStr)
  if (!due) return false
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return due < today
}

export function formatDueDate(dateStr) {
  const d = parseDueDate(dateStr)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

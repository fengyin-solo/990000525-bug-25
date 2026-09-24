// Single source of truth for due-date handling on the frontend.
//
// A due date is a calendar day stored/transferred as strict 'YYYY-MM-DD'.
// Using one helper everywhere keeps the board list, card detail and the state
// after re-entering a board in sync: an absent or invalid date is treated as
// "no due date" everywhere, and a day is only overdue once the calendar day
// has fully passed (no timezone off-by-one).

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Return a real Date for a valid 'YYYY-MM-DD' string, otherwise null. */
export function parseDueDate(value) {
  if (typeof value !== 'string') return null
  const match = DATE_RE.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** True only for a valid 'YYYY-MM-DD' calendar date. */
export function isValidDueDate(value) {
  return parseDueDate(value) !== null
}

/** A card has a due date only when its value is a real, parseable date. */
export function hasDueDate(card) {
  return !!card && isValidDueDate(card.due_date)
}

/** True when the due day is strictly before today (today itself is not overdue). */
export function isCardOverdue(card, now = new Date()) {
  const due = parseDueDate(card?.due_date)
  if (!due) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return due < today
}

/** Format a valid date as 'Mon D'; returns '' for absent/invalid values. */
export function formatDueDate(value) {
  const due = parseDueDate(value)
  if (!due) return ''
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

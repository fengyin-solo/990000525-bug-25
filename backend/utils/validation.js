// Shared validation/normalization helpers for card fields.
//
// due_date is stored as a calendar date in strict 'YYYY-MM-DD' form (no time,
// no timezone). Anything that does not represent a real calendar date is
// rejected so invalid/half-finished values never reach the database.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeDueDate(value) {
  // null / undefined / '' mean "no due date"
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid due date');

  const match = DATE_RE.exec(value);
  if (!match) throw new Error('Invalid due date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error('Invalid due date');

  // Reject impossible dates such as 2026-02-31 or 2026-02-29 on a non-leap year.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Invalid due date');
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

const VALID_PRIORITIES = ['low', 'medium', 'high'];

function normalizePriority(value) {
  if (value === undefined || value === null || value === '') return 'medium';
  if (typeof value !== 'string' || !VALID_PRIORITIES.includes(value)) {
    throw new Error('Invalid priority');
  }
  return value;
}

module.exports = { normalizeDueDate, normalizePriority, VALID_PRIORITIES };

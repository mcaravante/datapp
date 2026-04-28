/**
 * Tiny CSV serializer. RFC 4180-ish: CRLF rows, double-quote when the
 * value contains a comma / quote / newline, escape inner quotes by
 * doubling them. Adds a UTF-8 BOM so Excel on Windows opens it without
 * mojibake on accented characters.
 */
export function toCsv(headers: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const headerLine = headers.map(escapeField).join(',');
  const bodyLines = rows.map((row) => row.map(escapeField).join(','));
  return '﻿' + [headerLine, ...bodyLines].join('\r\n') + '\r\n';
}

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a sensible filename for a download: `<entity>-<YYYY-MM-DD>.csv`.
 */
export function csvFilename(entity: string, at: Date = new Date()): string {
  const iso = at.toISOString().slice(0, 10);
  return `${entity}-${iso}.csv`;
}

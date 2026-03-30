/**
 * Robust markdown table parser for finance API responses.
 * Handles empty cells (e.g. | | ) correctly by not using filter(Boolean).
 */
export function parseCSVContent(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  function splitRow(line: string): string[] {
    const trimmed = line.trim();
    const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
    const end = inner.endsWith("|") ? inner.slice(0, -1) : inner;
    return end.split("|").map((c) => c.trim());
  }

  const headers = splitRow(lines[0]);
  const numCols = headers.length;
  const rows: Record<string, string>[] = [];

  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    // Accept rows with exact match or up to 2 fewer columns (empty trailing cells)
    if (cells.length >= numCols - 2) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = cells[idx] || ""));
      rows.push(row);
    }
  }
  return rows;
}

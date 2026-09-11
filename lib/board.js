/**
 * dsh-plugin-focus — pure focus-board logic: parsing, rendering, mutations.
 *
 * No DSH or Cordis imports here, so this module is unit-testable in isolation.
 * The board is a small append-only text file (`.dsh/focus.md` by default) in
 * the agent's session workspace. It survives context compaction and later
 * sessions on the same workspace.
 *
 * File format:
 *
 *   # Focus Board
 *
 *   <!-- dsh-plugin-focus v1 -->
 *
 *   ## [2026-08-14T23:12:00.000Z] set
 *   <note text, may span lines>
 *
 *   ## [2026-08-14T23:13:00.000Z] append
 *   <another note>
 */

export const HEADER = "# Focus Board";
export const FORMAT_TAG = "<!-- dsh-plugin-focus v1 -->";
export const ARCHIVE_TAG = "<!-- dsh-plugin-focus archive -->";

/** Matches an entry heading line: `## [<iso-time>] <kind>` (kind: set|append|clear). */
const ENTRY_RE = /^## \[([^\]]+)\]\s+([a-z]+)\s*$/;

/** A board with no entries. */
export function emptyBoard() {
  return { entries: [] };
}

/**
 * Parse board file text into `{ entries: [{ time, kind, note }] }`.
 * Unknown lines before the first heading and between blocks are ignored;
 * lines after a heading (until the next one) accumulate into that note.
 * CRLF input is normalized.
 * @param text - raw file content.
 * @returns the parsed board.
 */
export function parseBoard(text) {
  const entries = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const match = ENTRY_RE.exec(raw.trim());
    if (match !== null) {
      current = { time: match[1], kind: match[2], note: "" };
      entries.push(current);
    } else if (current !== null) {
      current.note = current.note.length === 0 ? raw : current.note + "\n" + raw;
    }
  }
  for (const entry of entries) entry.note = entry.note.trim();
  return { entries };
}

/**
 * Serialize a board back to file text (append-friendly: oldest first).
 * @param board - the board to serialize.
 * @returns the file text, always ending with a newline.
 */
export function serializeBoard(board) {
  const body = board.entries
    .map((entry) => "## [" + entry.time + "] " + entry.kind + "\n" + entry.note)
    .join("\n\n");
  return body.length === 0
    ? HEADER + "\n\n" + FORMAT_TAG + "\n"
    : HEADER + "\n\n" + FORMAT_TAG + "\n\n" + body + "\n";
}

/**
 * Build the archive text produced when the board is cleared: every current
 * entry under an archive header stamped with the clear time. The result is
 * appended to the archive file, so past archives accumulate.
 * @param board - the board being cleared.
 * @param now - ISO timestamp of the clear.
 * @returns the archive block (ends with a newline).
 */
export function buildArchiveText(board, now) {
  const body = board.entries
    .map((entry) => "## [" + entry.time + "] " + entry.kind + "\n" + entry.note)
    .join("\n\n");
  return "# Focus Board Archive (cleared " + now + ")\n\n" + ARCHIVE_TAG + "\n\n" + body + "\n";
}

/**
 * Keep only the newest `maxEntries` entries (oldest dropped).
 * @param board - the board to trim.
 * @param maxEntries - maximum entry count (>= 1).
 * @returns the trimmed board.
 */
export function trimEntries(board, maxEntries) {
  if (board.entries.length <= maxEntries) return board;
  return { entries: board.entries.slice(-maxEntries) };
}

/**
 * Apply one mutation to a board and return the new board (immutable).
 * `set`/`append` append a timestamped entry (note is required, trimmed);
 * `clear` resets to an empty board.
 * @param board - the current board.
 * @param action - `set` | `append` | `clear`.
 * @param note - note text; required for `set`/`append`.
 * @param now - ISO timestamp for the new entry.
 * @returns the mutated board.
 * @throws when the action is unknown or the note is missing for set/append.
 */
export function applyAction(board, action, note, now, meta = {}) {
  if (action === "set" || action === "append") {
    if (typeof note !== "string" || note.trim().length === 0) {
      throw new Error('focus: "note" is required for action "' + action + '"');
    }
    const composed = composeNote({ kind: meta.kind ?? null, status: meta.status ?? null, text: note });
    return { entries: board.entries.concat([{ time: now, kind: action, note: composed }]) };
  }
  if (action === "clear") return emptyBoard();
  throw new Error('focus: unknown action "' + action + '"');
}

/** Structured entry kinds recognised by the board. */
export const ENTRY_KINDS = ["objective", "constraint", "decision", "note"];

/** Entry statuses for tagged items. */
export const ENTRY_STATUSES = ["open", "done"];

const NOTE_TAG_RE = /^\[([a-z]+)(?:\|([a-z]+))?\]\s*/;

/**
 * Split an optional leading "[kind|status]" tag off a note. Untagged notes
 * (the v1.0 format) parse with kind/status null, so the board stays readable
 * and append-only across versions.
 */
export function parseNoteTag(note = "") {
  const text = String(note);
  const match = NOTE_TAG_RE.exec(text);
  if (match === null) return { kind: null, status: null, text };
  const kind = ENTRY_KINDS.includes(match[1]) ? match[1] : null;
  const status = match[2] !== undefined && ENTRY_STATUSES.includes(match[2]) ? match[2] : null;
  if (kind === null && status === null) return { kind: null, status: null, text };
  return { kind, status, text: text.slice(match[0].length).trim() };
}

/** Compose a note from an optional tag and the note text. */
export function composeNote({ kind = null, status = null, text = "" } = {}) {
  const body = String(text).trim();
  if (!kind && !status) return body;
  const k = ENTRY_KINDS.includes(kind) ? kind : "note";
  return "[" + k + (status ? "|" + status : "") + "] " + body;
}

/** Entries with their tags parsed (untagged entries keep kind/status null). */
export function tagEntries(board) {
  return (board && Array.isArray(board.entries) ? board.entries : []).map((entry) => {
    const tag = parseNoteTag(entry.note);
    return { time: entry.time, kind: entry.kind, note: entry.note, tagKind: tag.kind, status: tag.status, text: tag.text };
  });
}

/** Counts, groupings and completion rate for the summary view. */
export function summarizeBoard(board) {
  const entries = tagEntries(board);
  const byKind = { objective: 0, constraint: 0, decision: 0, note: 0, untagged: 0 };
  let open = 0;
  let done = 0;
  for (const entry of entries) {
    const key = entry.tagKind ?? "untagged";
    byKind[key] = (byKind[key] || 0) + 1;
    if (entry.status === "open") open += 1;
    else if (entry.status === "done") done += 1;
  }
  const tracked = open + done;
  return {
    total: entries.length,
    byKind,
    open,
    done,
    completionRate: tracked > 0 ? Math.round((done / tracked) * 1000) / 10 : null,
    entries,
  };
}

/** Compact markdown summary: counts, open items, constraints and decisions. */
export function renderSummary(board, { maxItems = 8 } = {}) {
  const stats = summarizeBoard(board);
  const latest = (kind, status) => stats.entries
    .filter((e) => (kind === undefined || e.tagKind === kind) && (status === undefined || e.status === status))
    .slice(-Math.max(1, maxItems))
    .reverse();
  const lines = [
    "# Focus summary",
    "",
    "Entries: " + stats.total + " | open: " + stats.open + " | done: " + stats.done +
      (stats.completionRate === null ? "" : " | completion: " + stats.completionRate + "%"),
    "",
    "| Kind | Count |",
    "|------|-------|",
    ...ENTRY_KINDS.map((k) => "| " + k + " | " + (stats.byKind[k] || 0) + " |"),
    "| untagged | " + (stats.byKind.untagged || 0) + " |",
  ];
  const block = (title, rows) => {
    if (rows.length === 0) return;
    lines.push("", "## " + title, "");
    for (const r of rows) lines.push("- " + (r.status ? "[" + r.status + "] " : "") + r.text);
  };
  block("Open items", latest(undefined, "open"));
  block("Constraints", latest("constraint"));
  block("Recent decisions", latest("decision"));
  if (stats.total === 0) lines.push("", "(the board is empty)");
  return lines.join("\n");
}
/**
 * Render the board for the model: newest entry first, capped at `maxChars`.
 * Older entries are omitted from the view (never deleted from the file) with
 * a footer stating how many were omitted.
 * @param board - the board to render.
 * @param maxChars - maximum output characters.
 * @returns the rendered markdown text.
 */
export function renderBoard(board, maxChars = 8000) {
  const entries = board.entries.slice().reverse(); // newest first
  const blocks = [];
  let total = HEADER.length;
  let omitted = 0;
  for (let i = 0; i < entries.length; i++) {
    const tag = parseNoteTag(entries[i].note);
    const mark = tag.status === "done" ? " ✅" : tag.status === "open" ? " ⏳" : "";
    const shown = tag.kind ? "[" + tag.kind + "]" + mark + " " + tag.text : entries[i].note;
    const block = "## [" + entries[i].time + "] " + entries[i].kind + "\n" + shown;
    const separator = blocks.length === 0 ? 1 : 2;
    if (total + block.length + separator > maxChars) {
      omitted = entries.length - i;
      break;
    }
    blocks.push(block);
    total += block.length + separator;
  }
  const lines = [HEADER];
  for (const block of blocks) lines.push("", block);
  if (omitted > 0) {
    lines.push("", "(... " + omitted + " older entr" + (omitted === 1 ? "y" : "ies") + " omitted from this view; the file on disk is complete)");
  }
  return lines.join("\n");
}

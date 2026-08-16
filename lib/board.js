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
export function applyAction(board, action, note, now) {
  if (action === "set" || action === "append") {
    if (typeof note !== "string" || note.trim().length === 0) {
      throw new Error('focus: "note" is required for action "' + action + '"');
    }
    return { entries: board.entries.concat([{ time: now, kind: action, note: note.trim() }]) };
  }
  if (action === "clear") return emptyBoard();
  throw new Error('focus: unknown action "' + action + '"');
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
    const block = "## [" + entries[i].time + "] " + entries[i].kind + "\n" + entries[i].note;
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

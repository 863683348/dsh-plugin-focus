import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  composeNote,
  parseNoteTag,
  renderSummary,
  summarizeBoard,
  tagEntries,
  buildArchiveText,
  emptyBoard,
  parseBoard,
  renderBoard,
  serializeBoard,
  trimEntries,
} from "../lib/board.js";

test("serialize/parse roundtrip preserves entries and notes", () => {
  const board = {
    entries: [
      { time: "2026-08-14T23:00:00.000Z", kind: "set", note: "Fix the build" },
      { time: "2026-08-14T23:01:00.000Z", kind: "append", note: "Root cause is the linker flag." },
    ],
  };
  const text = serializeBoard(board);
  const parsed = parseBoard(text);
  assert.deepEqual(parsed, board);
});

test("parseBoard normalizes CRLF and keeps multiline notes", () => {
  const text = [
    "# Focus Board",
    "",
    "<!-- dsh-plugin-focus v1 -->",
    "",
    "## [2026-08-14T23:00:00.000Z] set",
    "line one",
    "  line two indented",
    "",
    "## [2026-08-14T23:01:00.000Z] append",
    "tail",
    "",
  ].join("\r\n");
  const board = parseBoard(text);
  assert.equal(board.entries.length, 2);
  assert.equal(board.entries[0].note, "line one\n  line two indented");
  assert.equal(board.entries[1].note, "tail");
});

test("applyAction: set and append require a non-empty note", () => {
  assert.throws(() => applyAction(emptyBoard(), "set", "   ", "t"), /note.*required/);
  assert.throws(() => applyAction(emptyBoard(), "append", "", "t"), /note.*required/);
  assert.throws(() => applyAction(emptyBoard(), "bogus", "x", "t"), /unknown action/);
});

test("applyAction appends timestamped entries in order", () => {
  let board = applyAction(emptyBoard(), "set", "objective", "t1");
  board = applyAction(board, "append", "decision", "t2");
  assert.deepEqual(board.entries, [
    { time: "t1", kind: "set", note: "objective" },
    { time: "t2", kind: "append", note: "decision" },
  ]);
});

test("applyAction clear resets to empty", () => {
  let board = applyAction(emptyBoard(), "set", "objective", "t1");
  board = applyAction(board, "clear", "", "t2");
  assert.deepEqual(board, emptyBoard());
});

test("trimEntries keeps only the newest entries", () => {
  const board = {
    entries: [
      { time: "t1", kind: "set", note: "a" },
      { time: "t2", kind: "append", note: "b" },
      { time: "t3", kind: "append", note: "c" },
    ],
  };
  const trimmed = trimEntries(board, 2);
  assert.deepEqual(trimmed.entries.map((e) => e.note), ["b", "c"]);
});

test("buildArchiveText stamps the clear time and carries every entry", () => {
  const board = {
    entries: [
      { time: "t1", kind: "set", note: "objective" },
      { time: "t2", kind: "append", note: "decision" },
    ],
  };
  const text = buildArchiveText(board, "2026-08-14T23:30:00.000Z");
  assert.ok(text.startsWith("# Focus Board Archive (cleared 2026-08-14T23:30:00.000Z)"));
  assert.ok(text.includes("## [t1] set\nobjective"));
  assert.ok(text.includes("## [t2] append\ndecision"));
  const parsed = parseBoard(text);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].note, "objective");
});

test("clear flow: archive keeps history while the board empties", () => {
  let board = applyAction(emptyBoard(), "set", "objective", "t1");
  board = applyAction(board, "append", "decision", "t2");
  const archiveText = buildArchiveText(board, "t9");
  const cleared = applyAction(board, "clear", "", "t10");
  assert.deepEqual(cleared, emptyBoard());
  const archived = parseBoard(archiveText);
  assert.equal(archived.entries.length, 2);
  assert.equal(archived.entries[1].note, "decision");
});

test("renderBoard shows newest first and reports omitted entries under cap", () => {
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({ time: "t" + i, kind: "append", note: "note-" + i });
  }
  const text = renderBoard({ entries }, 120);
  const firstEntry = text.indexOf("## [t9]");
  const secondEntry = text.indexOf("## [t8]");
  assert.ok(firstEntry !== -1 && firstEntry < secondEntry);
  assert.match(text, /\(... \d+ older entries omitted/);
});

test("renderBoard without cap shows every entry", () => {
  const board = {
    entries: [
      { time: "t1", kind: "set", note: "a" },
      { time: "t2", kind: "append", note: "b" },
    ],
  };
  const text = renderBoard(board, 8000);
  assert.ok(text.includes("## [t2]"));
  assert.ok(text.includes("## [t1]"));
  assert.ok(!text.includes("omitted"));
});


test("renderBoard handles an empty board", () => {
  const text = renderBoard(emptyBoard(), 8000);
  assert.equal(text, "# Focus Board");
});

test("renderBoard with maxEntries 1 keeps only newest", () => {
  let board = applyAction(emptyBoard(), "set", "a", "t1");
  board = applyAction(board, "append", "b", "t2");
  const trimmed = trimEntries(board, 1);
  assert.deepEqual(trimmed.entries.map((e) => e.note), ["b"]);
});

test("notes preserve unicode and CJK content", () => {
  let board = applyAction(emptyBoard(), "set", "约束：不改动公共 API。🚫", "t1");
  const text = serializeBoard(board);
  const parsed = parseBoard(text);
  assert.equal(parsed.entries[0].note, "约束：不改动公共 API。🚫");
});

test("oversized single note is capped by render but kept on disk", () => {
  const board = { entries: [{ time: "t1", kind: "set", note: "x".repeat(5000) }] };
  const text = renderBoard(board, 1000);
  assert.ok(text.length <= 1000);
  assert.equal(parseBoard(serializeBoard(board)).entries[0].note.length, 5000);
});


test("parseNoteTag splits kind and status, leaving plain notes alone", () => {
  assert.deepEqual(parseNoteTag("[decision|open] use SQLite"), { kind: "decision", status: "open", text: "use SQLite" });
  assert.deepEqual(parseNoteTag("[constraint] no new deps"), { kind: "constraint", status: null, text: "no new deps" });
  assert.deepEqual(parseNoteTag("plain note"), { kind: null, status: null, text: "plain note" });
  assert.deepEqual(parseNoteTag("[bogus|weird] x"), { kind: null, status: null, text: "[bogus|weird] x" });
});

test("composeNote round-trips through parseNoteTag", () => {
  const note = composeNote({ kind: "objective", status: "done", text: "ship v1.1" });
  assert.equal(note, "[objective|done] ship v1.1");
  assert.deepEqual(parseNoteTag(note), { kind: "objective", status: "done", text: "ship v1.1" });
  assert.equal(composeNote({ text: "no tag" }), "no tag");
  assert.equal(composeNote({ status: "open", text: "x" }), "[note|open] x", "status without kind falls back to note");
});

test("applyAction accepts structured meta and stays backward compatible", () => {
  const base = emptyBoard();
  const tagged = applyAction(base, "append", "pin the target", "2026-08-22T00:00:00Z", { kind: "constraint", status: "open" });
  assert.equal(tagged.entries[0].note, "[constraint|open] pin the target");
  const plain = applyAction(base, "set", "just a note", "2026-08-22T00:00:00Z");
  assert.equal(plain.entries[0].note, "just a note", "no meta keeps the v1.0 format");
});

test("summarizeBoard counts kinds, statuses and completion", () => {
  let board = emptyBoard();
  board = applyAction(board, "set", "objective A", "t1", { kind: "objective", status: "open" });
  board = applyAction(board, "append", "no new deps", "t2", { kind: "constraint" });
  board = applyAction(board, "append", "use SQLite", "t3", { kind: "decision", status: "done" });
  board = applyAction(board, "append", "untagged thought", "t4");
  const stats = summarizeBoard(board);
  assert.equal(stats.total, 4);
  assert.equal(stats.byKind.objective, 1);
  assert.equal(stats.byKind.constraint, 1);
  assert.equal(stats.byKind.decision, 1);
  assert.equal(stats.byKind.untagged, 1);
  assert.equal(stats.open, 1);
  assert.equal(stats.done, 1);
  assert.equal(stats.completionRate, 50);
});

test("summarizeBoard handles an empty board", () => {
  const stats = summarizeBoard(emptyBoard());
  assert.equal(stats.total, 0);
  assert.equal(stats.completionRate, null);
  assert.equal(stats.open, 0);
});

test("renderSummary lists open items, constraints and decisions", () => {
  let board = emptyBoard();
  board = applyAction(board, "append", "ship the release", "t1", { kind: "objective", status: "open" });
  board = applyAction(board, "append", "no new dependencies", "t2", { kind: "constraint" });
  board = applyAction(board, "append", "keep the format append-only", "t3", { kind: "decision" });
  const md = renderSummary(board);
  assert.ok(md.startsWith("# Focus summary"));
  assert.ok(md.includes("Entries: 3 | open: 1 | done: 0"));
  assert.ok(md.includes("| objective | 1 |"));
  assert.ok(md.includes("## Open items"));
  assert.ok(md.includes("- [open] ship the release"));
  assert.ok(md.includes("## Constraints"));
  assert.ok(md.includes("- no new dependencies"));
  assert.ok(md.includes("## Recent decisions"));
  assert.ok(renderSummary(emptyBoard()).includes("(the board is empty)"));
});

test("renderBoard marks tagged entries and leaves untagged ones intact", () => {
  let board = emptyBoard();
  board = applyAction(board, "append", "done thing", "t1", { kind: "decision", status: "done" });
  board = applyAction(board, "append", "open thing", "t2", { kind: "objective", status: "open" });
  const md = renderBoard(board);
  assert.ok(md.includes("[decision] ✅ done thing"));
  assert.ok(md.includes("[objective] ⏳ open thing"));
  const plain = renderBoard(applyAction(emptyBoard(), "append", "raw note", "t3"));
  assert.ok(plain.includes("raw note"));
  assert.ok(!plain.includes("✅"), "untagged notes are not decorated");
});

test("tagEntries exposes parsed tags in board order", () => {
  let board = emptyBoard();
  board = applyAction(board, "append", "a", "t1", { kind: "decision" });
  board = applyAction(board, "append", "b", "t2");
  const rows = tagEntries(board);
  assert.equal(rows[0].tagKind, "decision");
  assert.equal(rows[1].tagKind, null);
  assert.equal(rows[1].text, "b");
});

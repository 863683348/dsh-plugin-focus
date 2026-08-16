import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
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

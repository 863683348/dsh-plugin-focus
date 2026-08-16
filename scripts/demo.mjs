/**
 * dsh-plugin-focus — runnable demo of the board lifecycle.
 *
 * No DSH runtime needed: exercises lib/board.js directly in Node and prints
 * the board file at each step. Run: node scripts/demo.mjs
 */
import { applyAction, buildArchiveText, emptyBoard, renderBoard, serializeBoard, trimEntries } from "../lib/board.js";

const DEMO_MAX_ENTRIES = 60;

let board = emptyBoard();
const step = (label) => console.log("\n── " + label + " ──");

step("1. set — pin the objective and constraints");
board = trimEntries(applyAction(board, "set", "Objective: ship the focus board MVP.", "2026-08-16T10:00:00.000Z"), DEMO_MAX_ENTRIES);
board = trimEntries(applyAction(board, "append", "Constraint: never touch the public API.", "2026-08-16T10:05:00.000Z"), DEMO_MAX_ENTRIES);
console.log(renderBoard(board));

step("2. append — log a decision");
board = trimEntries(applyAction(board, "append", "Decision: board file lives at .dsh/focus.md.", "2026-08-16T10:10:00.000Z"), DEMO_MAX_ENTRIES);
console.log(renderBoard(board));

step("3. clear — archive the old board, then start fresh");
const archive = buildArchiveText(board, "2026-08-16T11:00:00.000Z");
console.log("archive block written to .dsh/focus.md.bak:\n\n" + archive);
board = applyAction(board, "clear", "", "2026-08-16T11:00:00.000Z");
console.log("board after clear:\n" + renderBoard(board));

console.log("\nSerialized board file (what .dsh/focus.md would contain):\n");
console.log(serializeBoard(board));

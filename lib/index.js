/**
 * dsh-plugin-focus — a model-facing `focus` tool, automatic board injection,
 * a session projection for UIs, and prompt guidance.
 *
 * A Cordis plugin. When this package is a profile layer (declares
 * `dsh.bundle.patch`), its `cordis.patch.yml` inserts this row into the
 * launcher composition: the host runner loads this file (tool + injection +
 * projection), and the browser runner loads `./client` (the read-only focus
 * panel) because the package declares `dsh.client`. The tool writes ONLY
 * inside the calling agent's session workspace (containment is enforced
 * against `ctx.fs`).
 *
 * @module dsh-plugin-focus
 */
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import {
  applyAction,
  buildArchiveText,
  emptyBoard,
  parseBoard,
  renderBoard,
  renderSummary,
  summarizeBoard,
  serializeBoard,
  trimEntries,
} from "./board.js";

/** Cordis plugin name (registered with the loader). */
const name = "focus";

/** Services this plugin must resolve before it applies (host face). */
const inject = ["tools", "fs", "systemPrompt", "agents"];

/** Composition-row configuration for the plugin entry. */
const Config = z.object({
  /** Board file path, relative to the agent's session workspace. */
  file: z.string().default(".dsh/focus.md"),
  /** Archive file path (clear moves the old board here). */
  archiveFile: z.string().default(".dsh/focus.md.bak"),
  /** Keep an archive of the cleared board. */
  archive: z.boolean().default(true),
  /** Keep at most this many entries on disk (oldest dropped). */
  maxEntries: z.number().default(60),
  /** Render cap for the model-facing board text (get / injection). */
  maxChars: z.number().default(8000),
  /** Inject the board into the model context at turn start and on changes. */
  autoInject: z.boolean().default(true),
  /** Register the focus prompt-guidance section. */
  personaSection: z.boolean().default(true),
  /** Order of the focus prompt section (ascending; persona is 0). */
  sectionOrder: z.number().default(5),
});

/** Prompt section telling the agent how to use the board. */
const FOCUS_SECTION_TEXT = "The `focus` tool maintains a durable focus board for the current task: a small note file (`.dsh/focus.md` by default) persisted in this session's workspace. Unlike the todo list (what to do next), the board pins what must NOT drift — the objective, hard constraints, and decisions.\n\nUse it deliberately:\n- At task start, or whenever the objective changes, call `focus set` with the current objective and any hard constraints.\n- While working, `focus append` decisions, reversals, and discoveries worth remembering.\n- After an interruption, before switching subtasks, or when context was compacted, call `focus get` to re-read the board.\n- When the task is done or the board is stale, `focus clear`.\n\nThe board is also injected into your context automatically at each turn start. Keep notes terse — a line or two. The board is working context, not documentation.";

/** Session event payload appended on every board mutation. */
function boardEvent(action, board, text) {
  return {
    board: text,
    entries: board.entries.length,
    action,
  };
}

/**
 * Resolve a path relative to the agent's session workspace and refuse to
 * escape it: focus-owned files must stay inside the session's own workspace.
 * @param ctx - registrant context (provides `ctx.fs`).
 * @param file - relative path.
 * @param cwd - the session workspace (undefined falls back to the fs default).
 * @param signal - caller cancellation.
 * @returns the resolved fs target.
 */
async function resolveTarget(ctx, file, cwd, signal) {
  const target = await ctx.fs.resolve(file, cwd !== undefined ? { cwd, signal } : { signal });
  if (cwd !== undefined) {
    const cwdTarget = await ctx.fs.resolve(".", { cwd, signal });
    if (!ctx.fs.contains(cwdTarget, target)) {
      throw new Error('focus: configured file "' + file + '" escapes the session workspace');
    }
  }
  return target;
}

/**
 * Load the current board from disk. A missing file is an empty board.
 * @param ctx - registrant context (provides `ctx.fs`).
 * @param file - relative board path.
 * @param cwd - the session workspace (undefined falls back to the fs default).
 * @param signal - caller cancellation.
 * @returns the parsed board.
 */
async function loadBoard(ctx, file, cwd, signal) {
  const target = await resolveTarget(ctx, file, cwd, signal);
  const info = await ctx.fs.stat(target, signal);
  if (info === undefined) return emptyBoard();
  const text = await ctx.fs.readText(target, signal);
  return text.trim().length === 0 ? emptyBoard() : parseBoard(text);
}

/**
 * Append an archive block to the archive file, creating it when missing.
 * @param ctx - registrant context.
 * @param archiveFile - relative archive path.
 * @param archiveText - the block to append.
 * @param cwd - the session workspace.
 * @param signal - caller cancellation.
 * @returns the resolved archive target.
 */
async function appendArchive(ctx, archiveFile, archiveText, cwd, signal) {
  const target = await resolveTarget(ctx, archiveFile, cwd, signal);
  const info = await ctx.fs.stat(target, signal);
  const existing = info !== undefined ? await ctx.fs.readText(target, signal) : "";
  const content = existing.length === 0 || existing.endsWith("\n")
    ? existing + archiveText
    : existing + "\n" + archiveText;
  await ctx.fs.writeText(target, content, undefined, signal);
  return target;
}

/**
 * Register the `focus` tool, the session projection, the automatic
 * injection, and (when configured) the prompt section.
 * @param ctx - registrant context carrying `tools`, `fs`, `systemPrompt`, `agents`.
 * @param config - validated plugin configuration.
 */
function apply(ctx, config) {
  const { file, maxEntries, maxChars, autoInject, personaSection, sectionOrder } = config;

  ctx.tools.register(defineTool({
    name: "focus",
    description: "Maintain a durable focus board for the current task: a small note file (default .dsh/focus.md) persisted in this session's workspace that survives compaction and later sessions on the same workspace. Use `set` to pin the current objective and constraints (call it at task start and whenever the objective changes), `append` to log decisions and discoveries, `get` to re-read the board after interruptions or context loss, `summary` for a grouped view (counts by kind, open items, constraints, decisions), `clear` to reset it (the old board is archived to .dsh/focus.md.bak). Tag entries with kind (objective | constraint | decision | note) and status (open | done) so the summary and the auto-injected context can prioritise constraints and open items. Keep notes terse.",
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ["set", "get", "append", "summary", "clear"],
        description: "What to do with the focus board.",
      },
      note: {
        type: "string",
        description: "The note text. Required for `set` (pin/replace the focus) and `append` (add a log entry); ignored for `get`/`summary`/`clear`.",
      },
      kind: {
        type: "string",
        enum: ["objective", "constraint", "decision", "note"],
        description: "Optional structured tag for `set`/`append` entries (default untagged).",
      },
      status: {
        type: "string",
        enum: ["open", "done"],
        description: "Optional status for tagged entries; mark items done instead of deleting them.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", required: true },
          path: { type: "string", required: true },
          entries: { type: "integer", required: true },
          open: { type: "integer" },
          done: { type: "integer" },
          summary: { type: "string" },
          changed: { type: "boolean", required: true },
          archived: { type: "boolean", required: true },
          archivePath: { type: "string" },
          board: { type: "string" },
        },
      },
      render: (_args, value) => {
        const head = "Focus " + value.action + ": " + value.entries + " entr" + (value.entries === 1 ? "y" : "ies") + ", " + (value.changed ? "changed" : "unchanged") + " — " + value.path;
        const lines = [head];
        if (value.archived) lines.push("Archived previous board to " + value.archivePath + ".");
        if (value.board !== undefined) lines.push("", value.board);
        if (value.summary !== undefined) lines.push("", value.summary);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (args, exec) => {
      const { action } = args;
      const note = typeof args.note === "string" ? args.note : "";
      if ((action === "set" || action === "append") && note.trim().length === 0) {
        throw new Error('focus: "note" is required for action "' + action + '"');
      }

      const cwd = exec.agent?.session?.header?.cwd;
      const board = await loadBoard(ctx, file, cwd, exec.signal);
      const before = board.entries.length;
      let updated = board;
      let archived = false;
      let archivePath;
      if (action === "set" || action === "append") {
        updated = trimEntries(applyAction(board, action, note, new Date().toISOString(), { kind: args.kind ?? null, status: args.status ?? null }), maxEntries);
      } else if (action === "clear") {
        if (config.archive && before > 0) {
          const target = await appendArchive(ctx, config.archiveFile, buildArchiveText(board, new Date().toISOString()), cwd, exec.signal);
          archived = true;
          archivePath = ctx.fs.processPath(target);
        }
        updated = emptyBoard();
      }

      const changed = updated.entries.length !== before;
      if (action !== "get" && changed) {
        const target = await resolveTarget(ctx, file, cwd, exec.signal);
        await ctx.fs.writeText(target, serializeBoard(updated), undefined, exec.signal);
        if (exec.agent?.session) {
          exec.agent.session.append("focus/write", boardEvent(action, updated, renderBoard(updated, maxChars)));
        }
      }

      const canonical = {
        action,
        path: ctx.fs.processPath(await resolveTarget(ctx, file, cwd, exec.signal)),
        entries: updated.entries.length,
        changed,
        archived,
      };
      if (archived) canonical.archivePath = archivePath;
      if (action === "get") canonical.board = renderBoard(updated, maxChars);
      if (action === "summary") {
        const stats = summarizeBoard(updated);
        canonical.open = stats.open;
        canonical.done = stats.done;
        canonical.summary = renderSummary(updated);
      }
      return canonical;
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Focus board: " + args.action,
      kind: "other",
      rawInput: args,
    }),
  }));

  // Session projection: the latest board text, for UIs (useProjection('focusBoard')).
  ctx.inject(["sessionProjections"], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: "focusBoard",
      schema: zod.union([
        zod.object({
          board: zod.string(),
          entries: zod.number(),
          action: zod.string(),
        }),
        zod.null(),
      ]),
      init: () => null,
      apply: (state, event) => {
        if (event.type === "focus/write") return event.data;
        if (event.type === "turn/start") return null;
        return state;
      },
      view: (state) => state,
      stateVersion: 1,
    });
  });

  // Automatic injection: at each turn start (step 1) — and again mid-turn when
  // the board text changes — put the board back into the model's context as a
  // plugin snapshot message. Session resume is covered: the resumed session's
  // first step is step 1 of a new turn. Mirrors dsh-time-context's mechanics.
  if (autoInject) {
    const lastInjected = new WeakMap();
    ctx.on("agent/pre-step", async ({ agent, turn, step, signal }, next) => {
      const decision = await next();
      if (decision.kind === "reject" || signal.aborted) return decision;
      const cwd = agent.session?.header?.cwd;
      let board;
      try {
        board = await loadBoard(ctx, file, cwd, signal);
      } catch {
        return decision;
      }
      if (board.entries.length === 0) return decision;
      const text = renderBoard(board, maxChars);
      const last = lastInjected.get(agent);
      if (step !== 1 && last === text) return decision;
      lastInjected.set(agent, text);
      agent.session.append("focus/write", boardEvent("auto", board, text));
      return {
        kind: "enter",
        messages: decision.messages.concat([createUserMessage({
          content: [{ type: "text", text: "Focus board (current):\n\n" + text }],
          source: {
            kind: "plugin",
            plugin: name,
            form: "snapshot",
            sections: [{ name: "focus:board", text }],
          },
        })]),
      };
    }, { prepend: true });
  }

  if (personaSection) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: "focus:instructions",
      order: sectionOrder,
      text: FOCUS_SECTION_TEXT,
    }), "focus.section()");
  }
}

export { Config, FOCUS_SECTION_TEXT, apply, inject, name };

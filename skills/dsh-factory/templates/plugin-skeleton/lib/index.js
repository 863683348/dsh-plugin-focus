/**
 * your-plugin-name — a Cordis plugin for DeepSeek Harness.
 * Register model tools via ctx.tools, prompt sections via
 * ctx.systemPrompt, and keep lifecycle in ctx.effect.
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "your-plugin";
const inject = ["tools", "fs", "systemPrompt"];

const Config = z.object({
  /** Example config field. */
  greeting: z.string().default("Hello from your-plugin!"),
});

function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: "your_tool",
    description: "What this tool does for the model.",
    parameters: {
      input: { type: "string", required: true, description: "Input text." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          echo: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: value.echo }],
    },
    execute: async (args) => ({ echo: config.greeting + " " + args.input }),
    presentCall: (args) => ({ card: "generic", title: "Your tool", kind: "other", rawInput: args }),
  }));
}

export { Config, apply, inject, name };

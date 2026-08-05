import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Aufgabe erstellen",
  description: "Create a task for a project on behalf of the signed-in user.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID of the project the task belongs to."),
    title: z.string().trim().min(1).describe("Short task title."),
    description: z.string().nullable().describe("Optional longer description."),
    priority: z
      .enum(["low", "medium", "high"])
      .nullable()
      .describe("Optional priority; defaults to medium."),
    due_date: z.string().nullable().describe("Optional due date as ISO date (YYYY-MM-DD)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ project_id, title, description, priority, due_date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id,
        title,
        description: description ?? null,
        priority: priority ?? "medium",
        due_date: due_date ?? null,
        user_id: ctx.getUserId(),
      })
      .select()
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { task: data },
    };
  },
});

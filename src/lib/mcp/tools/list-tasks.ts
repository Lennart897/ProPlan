import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "Aufgaben auflisten",
  description: "List tasks visible to the signed-in user, optionally filtered by project or status.",
  inputSchema: {
    project_id: z.string().uuid().nullable().describe("Optional project UUID filter."),
    status: z.string().nullable().describe("Optional task status filter (e.g. 'open', 'done')."),
    limit: z.number().int().min(1).max(100).nullable().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, project_id, assigned_to, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (project_id) query = query.eq("project_id", project_id);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});

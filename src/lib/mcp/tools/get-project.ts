import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Projekt-Details",
  description:
    "Get one manufacturing project with all fields, by project id (UUID) or by project number.",
  inputSchema: {
    id: z.string().uuid().nullable().describe("Project UUID. Use this or project_number."),
    project_number: z
      .number()
      .int()
      .nullable()
      .describe("Human-readable project number. Use this or id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, project_number }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!id && (project_number === null || project_number === undefined)) {
      return {
        content: [{ type: "text", text: "Provide either id or project_number." }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("manufacturing_projects_with_status_label").select("*").limit(1);
    query = id ? query.eq("id", id) : query.eq("project_number", project_number!);

    const { data, error } = await query.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return { content: [{ type: "text", text: "Project not found or not visible to you." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { project: data },
    };
  },
});

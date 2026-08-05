import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "Projekte auflisten",
  description:
    "List manufacturing projects visible to the signed-in user, with optional text search, status filter and archive filter.",
  inputSchema: {
    search: z
      .string()
      .nullable()
      .describe("Optional text matched against customer, article number or article name."),
    status: z.number().int().nullable().describe("Optional numeric project status filter."),
    archived: z.boolean().nullable().describe("Optional archive filter; defaults to non-archived."),
    limit: z.number().int().min(1).max(100).nullable().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, archived, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("manufacturing_projects_with_status_label")
      .select(
        "id, project_number, customer, artikel_nummer, artikel_bezeichnung, gesamtmenge, status, status_label, erste_anlieferung, letzte_anlieferung, archived, created_by_name, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    query = query.eq("archived", archived ?? false);
    if (status !== null && status !== undefined) query = query.eq("status", status);
    if (search) {
      const term = `%${search}%`;
      query = query.or(
        `customer.ilike.${term},artikel_nummer.ilike.${term},artikel_bezeichnung.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { projects: data ?? [] },
    };
  },
});

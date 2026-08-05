import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_articles",
  title: "Artikel auflisten",
  description: "List articles, optionally filtered by article number or name.",
  inputSchema: {
    search: z.string().nullable().describe("Optional search term for article number or name."),
    limit: z.number().int().min(1).max(100).nullable().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("articles").select("*").limit(limit ?? 25);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`artikel_nummer.ilike.${term},artikel_bezeichnung.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { articles: data ?? [] },
    };
  },
});

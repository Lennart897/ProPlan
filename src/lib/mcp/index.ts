import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjectsTool from "./tools/list-projects";
import getProjectTool from "./tools/get-project";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";
import listCustomersTool from "./tools/list-customers";
import listArticlesTool from "./tools/list-articles";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "proplan",
  title: "proplan",
  version: "0.1.0",
  instructions:
    "Tools for ProPlan, a manufacturing planning app. Use `whoami` to see the signed-in user, `list_projects`/`get_project` for manufacturing projects and their status, `list_tasks`/`create_task` for project tasks, and `list_customers`/`list_articles` for master data. All data is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listProjectsTool,
    getProjectTool,
    listTasksTool,
    createTaskTool,
    listCustomersTool,
    listArticlesTool,
  ],
});

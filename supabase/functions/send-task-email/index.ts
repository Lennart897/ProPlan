import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskPayload {
  id: string;
  title: string;
  description?: string | null;
  assigned_to: string; // email address
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const webhookUrl = Deno.env.get("MAKE_TASK_WEBHOOK_URL");
    if (!webhookUrl) {
      throw new Error("Missing MAKE_TASK_WEBHOOK_URL secret");
    }

    const body = (await req.json()) as TaskPayload;
    const { id, title, description, assigned_to } = body;

    if (!assigned_to || !title) {
      return new Response(JSON.stringify({ error: "assigned_to and title are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const payload = {
      type: "task",
      triggered_at: new Date().toISOString(),
      payload: { id, title, description: description ?? null, assigned_to },
    };

    console.log("Forwarding task to Make", { id, assigned_to, title });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Make webhooks often return 200/202, but can also be no-cors in some setups
    if (!res.ok) {
      const txt = await res.text();
      console.error("Make webhook failed", res.status, txt);
      throw new Error(`Make webhook error: ${res.status}`);
    }

    console.log("Task dispatched to Make", { id, assigned_to, status: res.status });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-task-email error", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

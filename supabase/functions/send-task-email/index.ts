import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskPayload {
  id: string;
  title: string;
  description?: string | null;
  assigned_to: string;
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (req: Request) => {
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

    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
    if (!sendgridApiKey) {
      throw new Error("Missing SENDGRID_API_KEY secret");
    }

    const body = (await req.json()) as TaskPayload;
    const { id, title, description, assigned_to } = body;

    if (!assigned_to || !title) {
      return new Response(JSON.stringify({ error: "assigned_to and title are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeAssignedTo = escapeHtml(assigned_to);

    const htmlContent = `
      <h1>📋 ProPlan System – Neue Aufgabe zugewiesen</h1>
      <p>Hallo,</p>
      <p>Ihnen wurde eine neue Aufgabe im ProPlan System zugewiesen.</p>
      <hr>
      <h2>📋 Aufgabendetails</h2>
      <ul>
        <li><strong>Titel:</strong> ${safeTitle}</li>
        ${safeDescription ? `<li><strong>Beschreibung:</strong> ${safeDescription}</li>` : ''}
        <li><strong>Zugewiesen an:</strong> ${safeAssignedTo}</li>
      </ul>
      <hr>
      <p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p>
      <hr>
      <p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p>
      <p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>
    `;

    const sendgridPayload = {
      personalizations: [
        {
          to: [{ email: assigned_to }],
          subject: `📋 ProPlan - Neue Aufgabe: ${safeTitle}`
        }
      ],
      from: {
        email: "noreply@proplansystem.de",
        name: "ProPlan System"
      },
      content: [
        {
          type: "text/html",
          value: htmlContent
        }
      ]
    };

    console.log("Sending task email via SendGrid", { id, assigned_to });

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sendgridApiKey}`
      },
      body: JSON.stringify(sendgridPayload),
    });

    if (!res.ok) {
      console.error("SendGrid API failed", res.status);
      throw new Error(`SendGrid API error: ${res.status}`);
    }

    console.log("Task email sent via SendGrid", { id, assigned_to, status: res.status });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-task-email error", err?.message || err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

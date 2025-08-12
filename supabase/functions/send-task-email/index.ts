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

async function getAccessToken() {
  const tenantId = Deno.env.get("TENANT_ID");
  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Microsoft Graph credentials: TENANT_ID, MS_CLIENT_ID, or MS_CLIENT_SECRET");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Token fetch failed", res.status, txt);
    throw new Error(`Failed to obtain access token: ${res.status}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

async function sendMail(accessToken: string, senderEmail: string, toEmail: string, subject: string, html: string) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

  const payload = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients: [
        {
          emailAddress: { address: toEmail },
        },
      ],
    },
    saveToSentItems: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok && res.status !== 202) {
    const txt = await res.text();
    console.error("Graph sendMail failed", res.status, txt);
    throw new Error(`Graph sendMail error: ${res.status}`);
  }
  console.log("Graph sendMail success", { toEmail, status: res.status });
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

    const senderEmail = Deno.env.get("SENDER_EMAIL");
    if (!senderEmail) {
      throw new Error("Missing SENDER_EMAIL secret");
    }

    const body = (await req.json()) as TaskPayload;
    const { id, title, description, assigned_to } = body;

    if (!assigned_to || !title) {
      return new Response(JSON.stringify({ error: "assigned_to and title are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Preparing to send task email", { id, assigned_to, title });

    const token = await getAccessToken();

    const subject = `Neue Aufgabe: ${title}`;
    const html = `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Neue Aufgabe</h2>
        <p><strong>Titel:</strong> ${title}</p>
        ${description ? `<p><strong>Beschreibung:</strong> ${description}</p>` : ""}
        ${id ? `<p style="color:#667085; font-size: 12px;">Task-ID: ${id}</p>` : ""}
      </div>
    `;

    await sendMail(token, senderEmail, assigned_to, subject, html);

    console.log("Task email dispatched", { id, assigned_to });

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

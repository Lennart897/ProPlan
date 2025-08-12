import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProjectPayload {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge?: number | null;
  erste_anlieferung?: string | null; // ISO date
  letzte_anlieferung?: string | null; // ISO date
  beschreibung?: string | null;
  standort_verteilung?: Record<string, any> | null;
  created_by_id: string;
  created_by_name: string;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");

    if (!senderEmail) throw new Error("Missing SENDER_EMAIL secret");
    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");

    const body = (await req.json()) as ProjectPayload;
    const {
      id,
      project_number,
      customer,
      artikel_nummer,
      artikel_bezeichnung,
      gesamtmenge,
      erste_anlieferung,
      letzte_anlieferung,
      beschreibung,
      standort_verteilung,
      created_by_id,
      created_by_name,
    } = body;

    console.log("send-project-email payload", { id, project_number, customer, artikel_bezeichnung });

    // Admin client to bypass RLS and fetch recipients
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Get all supply_chain profiles
    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .eq('role', 'supply_chain');
    console.log('supply_chain profiles', profiles?.length || 0);

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supplyUserIds = (profiles || []).map((p: any) => p.user_id);

    if (!supplyUserIds.length) {
      console.warn('No supply_chain recipients found');
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2) List users to map user_id -> email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      console.error('listUsers failed', listErr);
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailById = new Map<string, string>();
    for (const u of list.users || []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }

    const recipients = Array.from(new Set(supplyUserIds
      .map((uid: string) => emailById.get(uid))
      .filter(Boolean))) as string[];

    if (!recipients.length) {
      console.warn('No recipient emails resolved for supply_chain profiles');
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log('Fetching Microsoft Graph token...');
    const token = await getAccessToken();

    const subject = `Neues Projekt #${project_number}: ${artikel_bezeichnung}`;
    const html = `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Neues Projekt angelegt</h2>
        <p><strong>Kunde:</strong> ${customer}</p>
        <p><strong>Artikel:</strong> ${artikel_nummer} — ${artikel_bezeichnung}</p>
        ${typeof gesamtmenge !== 'undefined' && gesamtmenge !== null ? `<p><strong>Gesamtmenge:</strong> ${gesamtmenge}</p>` : ''}
        ${erste_anlieferung ? `<p><strong>Erste Anlieferung:</strong> ${erste_anlieferung}</p>` : ''}
        ${letzte_anlieferung ? `<p><strong>Letzte Anlieferung:</strong> ${letzte_anlieferung}</p>` : ''}
        ${beschreibung ? `<p><strong>Beschreibung:</strong> ${beschreibung}</p>` : ''}
        ${standort_verteilung ? `<pre style="background:#f6f7f9;padding:8px;border-radius:6px;">${JSON.stringify(standort_verteilung, null, 2)}</pre>` : ''}
        <p style="color:#667085; font-size: 12px;">Angelegt von: ${created_by_name} • Projekt-ID: ${id}</p>
      </div>
    `;

    let sent = 0;
    const results = await Promise.allSettled(
      recipients.map((to) => sendMail(token, senderEmail, to, subject, html))
    );

    results.forEach((r) => (sent += r.status === 'fulfilled' ? 1 : 0));

    console.log('Project email dispatched', { id, sent, recipients });

    return new Response(JSON.stringify({ success: true, sent, recipients }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-project-email error", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

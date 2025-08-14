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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
    const webhookUrl = Deno.env.get("MAKE_PROJECT_WEBHOOK_URL");

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    if (!webhookUrl) throw new Error("Missing MAKE_PROJECT_WEBHOOK_URL secret");

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

    // Admin client to fetch potential recipients (supply_chain role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .eq('role', 'supply_chain');

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supplyUserIds = (profiles || []).map((p: any) => p.user_id);

    // Map user_id -> email using auth admin list
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

    const recipientEmails = Array.from(new Set(supplyUserIds
      .map((uid: string) => emailById.get(uid))
      .filter(Boolean))) as string[];

    const toRecipients = recipientEmails.map(email => ({
      emailAddress: {
        address: email
      }
    }));

    console.log('Resolved recipients for supply_chain', { count: toRecipients.length });

    // Forward to Make as Graph-compatible message format
    const payload = {
      message: {
        subject: `Neues Projekt #${project_number}: ${artikel_bezeichnung}`,
        body: {
          contentType: "HTML",
          content: `
            <h2>Neues Projekt erstellt</h2>
            <p><strong>Projekt Nr.:</strong> ${project_number}</p>
            <p><strong>Kunde:</strong> ${customer}</p>
            <p><strong>Artikel:</strong> ${artikel_bezeichnung}</p>
            <p><strong>Artikel Nr.:</strong> ${artikel_nummer}</p>
            ${gesamtmenge ? `<p><strong>Gesamtmenge:</strong> ${gesamtmenge}</p>` : ''}
            ${erste_anlieferung ? `<p><strong>Erste Anlieferung:</strong> ${erste_anlieferung}</p>` : ''}
            ${letzte_anlieferung ? `<p><strong>Letzte Anlieferung:</strong> ${letzte_anlieferung}</p>` : ''}
            ${beschreibung ? `<p><strong>Beschreibung:</strong> ${beschreibung}</p>` : ''}
            <p><strong>Erstellt von:</strong> ${created_by_name}</p>
            <p><strong>Erstellt am:</strong> ${new Date().toLocaleString('de-DE')}</p>
          `
        },
        toRecipients
      },
      metadata: {
        type: "project",
        triggered_at: new Date().toISOString(),
        project_id: id,
        project_number,
        created_by_id,
        standort_verteilung
      }
    };

    console.log("Forwarding project to Make", { id, recipients: toRecipients.length });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Make webhook failed", res.status, txt);
      throw new Error(`Make webhook error: ${res.status}`);
    }

    console.log("Project dispatched to Make", { id, status: res.status });

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails }), {
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

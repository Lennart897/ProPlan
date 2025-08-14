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

    // Helper functions for professional formatting
    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (quantity: number | null) => {
      if (!quantity) return 'Nicht angegeben';
      return new Intl.NumberFormat('de-DE').format(quantity) + ' kg';
    };

    const formatLocationDistribution = (distribution: Record<string, any> | null) => {
      if (!distribution) return 'Keine Verteilung angegeben';
      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => `${location.charAt(0).toUpperCase() + location.slice(1)}: ${formatQuantity(Number(qty))}`)
        .join('\n');
    };

    // Professional plain text email content in German
    const professionalEmailContent = `
╔═══════════════════════════════════════════════════════════════╗
║                        PROPLAN SYSTEM                        ║
║                  Neues Projekt zur Bearbeitung               ║
╚═══════════════════════════════════════════════════════════════╝

Sehr geehrte Damen und Herren,

ein neues Fertigungsprojekt wurde im ProPlan System erfasst und 
wartet auf Ihre fachkundige Prüfung und Bearbeitung.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PROJEKT-ÜBERSICHT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢  Projekt-Nr.:         #${project_number}
🏢  Kunde:               ${customer}
📦  Artikelnummer:       ${artikel_nummer}
📋  Artikelbezeichnung:  ${artikel_bezeichnung}
⚖️   Gesamtmenge:        ${formatQuantity(gesamtmenge)}
📅  Erste Anlieferung:   ${formatDate(erste_anlieferung)}
📅  Letzte Anlieferung:  ${formatDate(letzte_anlieferung)}
👤  Erstellt von:        ${created_by_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STANDORTVERTEILUNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${formatLocationDistribution(standort_verteilung).split('\n').map(line => `📍  ${line}`).join('\n')}${beschreibung ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PROJEKTBESCHREIBUNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${beschreibung}` : ''}

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚠️  HANDLUNGSERFORDERNIS                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Dieses Projekt wurde zur Bearbeitung durch die Supply Chain 
freigegeben und benötigt Ihre fachliche Bewertung sowie 
entsprechende Maßnahmen.

Bitte loggen Sie sich in das ProPlan System ein und führen Sie 
die erforderlichen Prüfungen durch:

🔗 System-Link: https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mit freundlichen Grüßen
ProPlan Benachrichtigungssystem

Diese E-Mail wurde automatisch generiert.
Bei Rückfragen wenden Sie sich bitte an: ${created_by_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // Forward to Make as Graph-compatible message format
    const payload = {
      message: {
        subject: `ProPlan - Neues Projekt #${project_number}: ${artikel_bezeichnung}`,
        body: {
          contentType: "Text",
          content: professionalEmailContent
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

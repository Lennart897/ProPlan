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
  erste_anlieferung?: string | null;
  letzte_anlieferung?: string | null;
  beschreibung?: string | null;
  standort_verteilung?: Record<string, any> | null;
  created_by_id: string;
  created_by_name: string;
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY secret");

    const body = (await req.json()) as ProjectPayload;
    const {
      id, project_number, customer, artikel_nummer, artikel_bezeichnung,
      gesamtmenge, erste_anlieferung, letzte_anlieferung, beschreibung,
      standort_verteilung, created_by_name,
    } = body;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get affected locations
    const affectedLocations: string[] = [];
    if (standort_verteilung) {
      for (const [location, quantity] of Object.entries(standort_verteilung)) {
        if (Number(quantity) > 0) affectedLocations.push(location);
      }
    }

    if (affectedLocations.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No affected locations" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const planningRoles = ['planung', ...affectedLocations.map(loc => `planung_${loc}`)];

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .in('role', planningRoles);

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const relevantProfiles = (profiles || []).filter((profile: any) => {
      if (profile.role === 'planung') return true;
      const roleLocation = profile.role.replace('planung_', '');
      return affectedLocations.includes(roleLocation);
    });

    const uniqueUserIds = Array.from(new Set(relevantProfiles.map((p: any) => p.user_id)));

    if (uniqueUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No planning users found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const getAllUsers = async () => {
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
        if (listErr) throw new Error(listErr.message);
        if (!list.users || list.users.length === 0) break;
        allUsers.push(...list.users);
        if (list.users.length < perPage) break;
        page++;
      }
      return allUsers;
    };

    let allUsers;
    try {
      allUsers = await getAllUsers();
    } catch (err: any) {
      console.error('Failed to load users:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailById = new Map<string, string>();
    for (const u of allUsers) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }

    const recipientEmails = Array.from(new Set(
      uniqueUserIds.map((uid: string) => emailById.get(uid)).filter((email): email is string => Boolean(email))
    ));

    if (recipientEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No valid recipients" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Sanitize content
    const safeProjectNumber = escapeHtml(String(project_number));
    const safeCustomer = escapeHtml(customer);
    const safeArtikelNummer = escapeHtml(artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(artikel_bezeichnung);
    const safeCreatedByName = escapeHtml(created_by_name);
    const safeBeschreibung = escapeHtml(beschreibung);

    const formatDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (quantity: number | null | undefined) => {
      if (!quantity) return 'Nicht angegeben';
      return new Intl.NumberFormat('de-DE').format(quantity) + ' Stück';
    };

    const formatLocationDistribution = (distribution: Record<string, any> | null | undefined) => {
      if (!distribution) return '<li>Keine Verteilung angegeben</li>';
      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => `<li><strong>${escapeHtml(location.charAt(0).toUpperCase() + location.slice(1))}:</strong> ${formatQuantity(Number(qty))}</li>`)
        .join('');
    };

    const professionalEmailContent = `<h1>📋 ProPlan System – Projekt zur Planung zugewiesen</h1><p>Sehr geehrte Damen und Herren der Planung,</p><p>ein Fertigungsprojekt wurde von der Supply Chain freigegeben und Ihrem Standort zur Planung zugewiesen.</p><hr><h2>📊 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li><li><strong>🏢 Kunde:</strong> ${safeCustomer}</li><li><strong>📦 Artikelnummer:</strong> ${safeArtikelNummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li><li><strong>⚖️ Gesamtmenge:</strong> ${formatQuantity(gesamtmenge)}</li><li><strong>📅 Erste Anlieferung:</strong> ${formatDate(erste_anlieferung)}</li><li><strong>📅 Letzte Anlieferung:</strong> ${formatDate(letzte_anlieferung)}</li><li><strong>👤 Erstellt von:</strong> ${safeCreatedByName}</li></ul><hr><h2>📍 Standortverteilung</h2><ul>${formatLocationDistribution(standort_verteilung)}</ul>${safeBeschreibung ? `<hr><h2>📝 Projektbeschreibung</h2><p>${safeBeschreibung}</p>` : ''}<hr><div style="border: 2px solid #2196f3; border-radius: 8px; padding: 16px; background-color: #e3f2fd; margin: 20px 0;"><h3 style="color: #1976d2; margin-top: 0;">📋 Handlungserfordernis</h3><p>Bitte prüfen Sie das Projekt und geben Sie es für Ihren Standort frei.</p></div><p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>`;

    const emailPromises = recipientEmails.map(async (email) => {
      const sendgridPayload = {
        personalizations: [
          {
            to: [{ email }],
            subject: `🗓️ ProPlan - Neue Planungsaufgabe: Projekt #${safeProjectNumber}`
          }
        ],
        from: { email: "noreply@proplansystem.de", name: "ProPlan System" },
        content: [{ type: "text/html", value: professionalEmailContent }]
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SENDGRID_API_KEY}`
        },
        body: JSON.stringify(sendgridPayload)
      });

      if (!response.ok) {
        console.error(`SendGrid error for ${email}:`, response.status);
        throw new Error(`SendGrid API error: ${response.status}`);
      }
    });

    await Promise.all(emailPromises);
    console.log("Planning notifications sent", { id, count: recipientEmails.length });

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails.length, affected_locations: affectedLocations }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-planning-notification error", err?.message || err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

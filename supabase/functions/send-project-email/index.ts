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

// Global cache to track processed requests
const processedRequests = new Map<string, number>();

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
    
    // Duplicate request check
    const requestKey = `project-${body.id}`;
    const now = Date.now();
    if (processedRequests.has(requestKey)) {
      const lastProcessed = processedRequests.get(requestKey)!;
      if (now - lastProcessed < 30000) {
        return new Response(JSON.stringify({ message: "Duplicate request skipped" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    processedRequests.set(requestKey, now);
    
    // Clean up old entries
    for (const [key, timestamp] of processedRequests.entries()) {
      if (now - timestamp > 300000) processedRequests.delete(key);
    }

    const {
      id, project_number, customer, artikel_nummer, artikel_bezeichnung,
      gesamtmenge, erste_anlieferung, letzte_anlieferung, beschreibung,
      standort_verteilung, created_by_id, created_by_name,
    } = body;

    console.log("send-project-email payload", { id, project_number });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .eq('role', 'supply_chain');

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const uniqueUserIds = Array.from(new Set((profiles || []).map((p: any) => p.user_id).filter(Boolean)));

    if (uniqueUserIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No supply chain users found' }), {
        status: 400,
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
      uniqueUserIds.map(uid => emailById.get(uid)).filter((e): e is string => Boolean(e))
    ));

    if (recipientEmails.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid recipients found' }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Sanitize all user-provided content
    const safeProjectNumber = escapeHtml(String(project_number));
    const safeCustomer = escapeHtml(customer);
    const safeArtikelNummer = escapeHtml(artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(artikel_bezeichnung);
    const safeCreatedByName = escapeHtml(created_by_name);
    const safeBeschreibung = escapeHtml(beschreibung);

    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (quantity: number | null | undefined) => {
      if (!quantity) return 'Nicht angegeben';
      return new Intl.NumberFormat('de-DE').format(quantity) + ' kg';
    };

    const formatLocationDistribution = (distribution: Record<string, any> | null | undefined) => {
      if (!distribution) return '<li>Keine Verteilung angegeben</li>';
      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => `<li><strong>${escapeHtml(location.charAt(0).toUpperCase() + location.slice(1))}:</strong> ${formatQuantity(Number(qty))}</li>`)
        .join('');
    };

    const professionalEmailContent = `<h1>🏭 ProPlan System – Neues Projekt zur Bearbeitung</h1><p>Sehr geehrte Damen und Herren,</p><p>ein neues Fertigungsprojekt wurde im ProPlan System erfasst und wartet auf Ihre Prüfung.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li><li><strong>🏢 Kunde:</strong> ${safeCustomer}</li><li><strong>📦 Artikelnummer:</strong> ${safeArtikelNummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li><li><strong>⚖️ Gesamtmenge:</strong> ${formatQuantity(gesamtmenge)}</li><li><strong>📅 Erste Anlieferung:</strong> ${formatDate(erste_anlieferung ?? null)}</li><li><strong>📅 Letzte Anlieferung:</strong> ${formatDate(letzte_anlieferung ?? null)}</li><li><strong>👤 Erstellt von:</strong> ${safeCreatedByName}</li></ul><hr><h2>📍 Standortverteilung</h2><ul>${formatLocationDistribution(standort_verteilung)}</ul>${safeBeschreibung ? `<hr><h2>📝 Projektbeschreibung</h2><p>${safeBeschreibung}</p>` : ''}<hr><div style="border: 2px solid #ff6b35; border-radius: 8px; padding: 16px; background-color: #fff3f0; margin: 20px 0;"><h3 style="color: #ff6b35; margin-top: 0;">⚠️ Handlungserfordernis</h3><p>Dieses Projekt wurde zur Bearbeitung durch die Supply Chain freigegeben und benötigt Ihre fachliche Bewertung.</p></div><p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>`;

    const emailPromises = recipientEmails.map(async (email) => {
      const sendgridPayload = {
        personalizations: [
          {
            to: [{ email }],
            subject: `📬 ProPlan - Neues Projekt #${safeProjectNumber}: ${safeCustomer}`
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
        console.error(`SendGrid API error for ${email}:`, response.status);
        throw new Error(`SendGrid API error: ${response.status}`);
      }
    });

    await Promise.all(emailPromises);
    console.log("Project emails sent", { id, count: recipientEmails.length });

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-project-email error", err?.message || err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

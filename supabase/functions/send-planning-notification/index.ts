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
    const webhookUrl = Deno.env.get("MAKE_PLANNING_WEBHOOK_URL");

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    if (!webhookUrl) throw new Error("Missing MAKE_PLANNING_WEBHOOK_URL secret");

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

    console.log("send-planning-notification payload", { id, project_number, customer, artikel_bezeichnung });

    // Admin client to fetch planning users for affected locations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get affected locations from standort_verteilung
    const affectedLocations: string[] = [];
    if (standort_verteilung) {
      for (const [location, quantity] of Object.entries(standort_verteilung)) {
        if (Number(quantity) > 0) {
          affectedLocations.push(location);
        }
      }
    }

    console.log('Affected locations for planning notification:', affectedLocations);

    if (affectedLocations.length === 0) {
      console.log('No affected locations found, skipping notification');
      return new Response(JSON.stringify({ success: true, message: "No affected locations" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get planning users for affected locations only
    const planningRoles = [
      'planung', // Legacy role that can see all locations
      ...affectedLocations.map(loc => `planung_${loc}`)
    ];

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .in('role', planningRoles);

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Filter profiles to only include those relevant to affected locations
    const relevantProfiles = (profiles || []).filter((profile: any) => {
      if (profile.role === 'planung') return true; // Legacy role sees all
      
      // Extract location from role (e.g., 'planung_mainz' -> 'mainz')
      const roleLocation = profile.role.replace('planung_', '');
      return affectedLocations.includes(roleLocation);
    });

    console.log('Found planning profiles for affected locations:', { count: relevantProfiles.length, roles: relevantProfiles.map(p => p.role) });

    // Get unique user IDs from profiles (remove duplicates at source)
    const uniqueUserIds = Array.from(new Set(relevantProfiles.map((p: any) => p.user_id)));
    console.log('Unique planning user IDs:', uniqueUserIds.length);

    if (uniqueUserIds.length === 0) {
      console.log('No planning users found for affected locations');
      return new Response(JSON.stringify({ success: true, message: "No planning users found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Map user_id -> email using auth admin list - load ALL users
    const getAllUsers = async () => {
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;
      
      while (true) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          console.error('listUsers failed', listErr);
          throw new Error(listErr.message);
        }
        
        if (!list.users || list.users.length === 0) break;
        allUsers.push(...list.users);
        
        // If we got less than perPage users, we've reached the end
        if (list.users.length < perPage) break;
        page++;
      }
      
      return allUsers;
    };

    let allUsers;
    try {
      allUsers = await getAllUsers();
    } catch (err: any) {
      console.error('Failed to load all users:', err);
      return new Response(JSON.stringify({ error: `Failed to load users: ${err.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log('Total auth users loaded:', allUsers.length);

    // Create email mapping
    const emailById = new Map<string, string>();
    for (const u of allUsers) {
      if (u.id && u.email) {
        emailById.set(u.id, u.email);
      }
    }

    // Get emails for planning users and deduplicate
    const recipientEmails = Array.from(new Set(
      uniqueUserIds
        .map((uid: string) => emailById.get(uid))
        .filter((email): email is string => Boolean(email))
    ));

    console.log('Final deduplicated recipient emails:', recipientEmails);

    const toRecipients = recipientEmails.map(email => ({
      emailAddress: {
        address: email
      }
    }));

    console.log('Resolved recipients for planning notification', { count: toRecipients.length });

    // Helper functions for professional formatting
    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (quantity: number | null) => {
      if (!quantity) return 'Nicht angegeben';
      return new Intl.NumberFormat('de-DE').format(quantity) + ' Stück';
    };

    const formatLocationDistribution = (distribution: Record<string, any> | null) => {
      if (!distribution) return '<li>Keine Verteilung angegeben</li>';
      
      const locationLabels: Record<string, string> = {
        'mainz': 'Mainz',
        'berlin': 'Berlin', 
        'muenchen': 'München',
        'hamburg': 'Hamburg',
        'koeln': 'Köln',
        'stuttgart': 'Stuttgart'
      };

      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => {
          const locationName = locationLabels[location] || location.charAt(0).toUpperCase() + location.slice(1);
          return `<li><strong>${locationName}:</strong> ${formatQuantity(Number(qty))}</li>`;
        })
        .join('');
    };

    // Clean HTML email content for planning notification
    const professionalEmailContent = `<h1>📋 ProPlan System – Projekt zur Planung zugewiesen</h1><p>Sehr geehrte Damen und Herren der Planung,</p><p>ein Fertigungsprojekt wurde von der Supply Chain freigegeben und Ihrem Standort zur Planung und Bearbeitung zugewiesen.</p><hr><h2>📊 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${project_number}</li><li><strong>🏢 Kunde:</strong> ${customer}</li><li><strong>📦 Artikelnummer:</strong> ${artikel_nummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${artikel_bezeichnung}</li><li><strong>⚖️ Gesamtmenge:</strong> ${formatQuantity(gesamtmenge)}</li><li><strong>📅 Erste Anlieferung:</strong> ${formatDate(erste_anlieferung)}</li><li><strong>📅 Letzte Anlieferung:</strong> ${formatDate(letzte_anlieferung)}</li><li><strong>👤 Erstellt von:</strong> ${created_by_name}</li></ul><hr><h2>📍 Standortverteilung</h2><ul>${formatLocationDistribution(standort_verteilung)}</ul>${beschreibung ? `<hr><h2>📝 Projektbeschreibung</h2><p>${beschreibung}</p>` : ''}<hr><div style="border: 2px solid #2196f3; border-radius: 8px; padding: 16px; background-color: #e3f2fd; margin: 20px 0;"><h3 style="color: #1976d2; margin-top: 0;">📋 Handlungserfordernis - Planung</h3><p>Dieses Projekt wurde von der Supply Chain genehmigt und benötigt nun Ihre Prüfung und Freigabe für die betroffenen Standorte.</p><p><strong>Bitte prüfen Sie das Projekt und geben Sie es für Ihren Standort frei.</strong></p></div><p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em><br>Bei Rückfragen wenden Sie sich bitte an: <strong>${created_by_name}</strong></p>`;

    // Send raw HTML content directly to Make
    const payload = {
      subject: `📋 ProPlan - Projekt zur Planung #${project_number}: ${artikel_bezeichnung}`,
      body: professionalEmailContent,
      toRecipients,
      metadata: {
        type: "planning_notification",
        triggered_at: new Date().toISOString(),
        project_id: id,
        project_number,
        created_by_id,
        affected_locations: affectedLocations,
        standort_verteilung
      }
    };

    console.log("Forwarding planning notification to Make", { id, recipients: toRecipients.length });

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

    console.log("Planning notification dispatched to Make", { id, status: res.status });

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails, affected_locations: affectedLocations }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-planning-notification error", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
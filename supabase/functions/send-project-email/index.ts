
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

    console.log('Supply chain profiles found:', profiles?.length || 0);
    console.log('Raw profiles:', profiles?.map(p => ({ user_id: p.user_id, display_name: p.display_name })));

    // Get unique user IDs from profiles (remove duplicates at source)
    const uniqueUserIds = Array.from(new Set((profiles || []).map((p: any) => p.user_id).filter(Boolean)));
    console.log('Unique supply chain user IDs:', uniqueUserIds.length);
    console.log('User IDs to fetch emails for:', uniqueUserIds);

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

    // Create email mapping and track inconsistencies
    const emailById = new Map<string, string>();
    const authUserIds = new Set<string>();
    
    for (const u of allUsers) {
      if (u.id) {
        authUserIds.add(u.id);
        if (u.email) {
          emailById.set(u.id, u.email);
        } else {
          console.warn(`Auth user ${u.id} has no email address`);
        }
      }
    }

    // Check for inconsistencies between profiles and auth
    const missingInAuth: string[] = [];
    const missingEmails: string[] = [];
    const foundEmails: Array<{userId: string, email: string}> = [];

    for (const userId of uniqueUserIds) {
      if (!authUserIds.has(userId)) {
        missingInAuth.push(userId);
        console.warn(`Profile user ${userId} not found in auth users`);
      } else {
        const email = emailById.get(userId);
        if (!email) {
          missingEmails.push(userId);
          console.warn(`Auth user ${userId} has no valid email address`);
        } else {
          foundEmails.push({ userId, email });
        }
      }
    }

    // Log inconsistency summary
    console.log('Inconsistency check summary:', {
      totalProfileUsers: uniqueUserIds.length,
      missingInAuth: missingInAuth.length,
      missingEmails: missingEmails.length,
      validEmailUsers: foundEmails.length,
      missingInAuthIds: missingInAuth,
      missingEmailIds: missingEmails
    });

    // Get emails for supply chain users and deduplicate by email address
    const emailSet = new Set<string>();
    const recipientEmails: string[] = [];
    
    for (const { email } of foundEmails) {
      if (!emailSet.has(email)) {
        emailSet.add(email);
        recipientEmails.push(email);
      } else {
        console.log(`Duplicate email found and skipped: ${email}`);
      }
    }

    console.log('Final email processing summary:', {
      uniqueEmails: recipientEmails.length,
      duplicatesRemoved: foundEmails.length - recipientEmails.length,
      finalRecipientEmails: recipientEmails
    });

    // Deduplicate email addresses one more time for safety
    const assignedTo = Array.from(new Set(recipientEmails));
    
    // Create toRecipients array in the format expected by Make webhook
    const toRecipients = assignedTo.map(email => ({
      emailAddress: {
        address: email
      }
    }));
    
    console.log('Final recipient list before webhook:', {
      totalRecipients: assignedTo.length,
      recipientEmails: assignedTo,
      toRecipientsFormat: toRecipients
    });

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
      if (!distribution) return '<li>Keine Verteilung angegeben</li>';
      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => `<li><strong>${location.charAt(0).toUpperCase() + location.slice(1)}:</strong> ${formatQuantity(Number(qty))}</li>`)
        .join('');
    };

    // Clean HTML email content without line breaks in template
    const professionalEmailContent = `<h1>🏭 ProPlan System – Neues Projekt zur Bearbeitung</h1><p>Sehr geehrte Damen und Herren,</p><p>ein neues Fertigungsprojekt wurde im ProPlan System erfasst und wartet auf Ihre fachkundige Prüfung und Bearbeitung.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${project_number}</li><li><strong>🏢 Kunde:</strong> ${customer}</li><li><strong>📦 Artikelnummer:</strong> ${artikel_nummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${artikel_bezeichnung}</li><li><strong>⚖️ Gesamtmenge:</strong> ${formatQuantity(gesamtmenge)}</li><li><strong>📅 Erste Anlieferung:</strong> ${formatDate(erste_anlieferung)}</li><li><strong>📅 Letzte Anlieferung:</strong> ${formatDate(letzte_anlieferung)}</li><li><strong>👤 Erstellt von:</strong> ${created_by_name}</li></ul><hr><h2>📍 Standortverteilung</h2><ul>${formatLocationDistribution(standort_verteilung)}</ul>${beschreibung ? `<hr><h2>📝 Projektbeschreibung</h2><p>${beschreibung}</p>` : ''}<hr><div style="border: 2px solid #ff6b35; border-radius: 8px; padding: 16px; background-color: #fff3f0; margin: 20px 0;"><h3 style="color: #ff6b35; margin-top: 0;">⚠️ Handlungserfordernis</h3><p>Dieses Projekt wurde zur Bearbeitung durch die Supply Chain freigegeben und benötigt Ihre fachliche Bewertung sowie entsprechende Maßnahmen.</p><p>Bitte loggen Sie sich in das ProPlan System ein und führen Sie die erforderlichen Prüfungen durch.</p></div><p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em><br>Bei Rückfragen wenden Sie sich bitte an: <strong>${created_by_name}</strong></p>`;

    // Send payload with toRecipients array for Make Outlook webhook
    const payload = {
      toRecipients: toRecipients, // Required array format for Make Outlook module
      subject: `ProPlan - Neues Projekt #${project_number}: ${artikel_bezeichnung}`,
      body: {
        contentType: "HTML",
        content: professionalEmailContent
      },
      metadata: {
        type: "project",
        triggered_at: new Date().toISOString(),
        project_id: id,
        project_number,
        created_by_id,
        standort_verteilung,
        total_recipients: assignedTo.length
      }
    };

    console.log("Forwarding project to Make with recipient array", { 
      id, 
      recipientCount: assignedTo.length,
      recipients: assignedTo
    });

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

    console.log("Project dispatched to Make", { id, status: res.status, recipientsSent: assignedTo.length });

    return new Response(JSON.stringify({ success: true, recipients: assignedTo }), {
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

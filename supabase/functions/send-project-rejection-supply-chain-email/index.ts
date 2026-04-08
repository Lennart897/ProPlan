import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProjectPayload {
  id: string;
  project_number: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge: number;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  beschreibung?: string;
  standort_verteilung: Record<string, number>;
  created_by_id: string;
  created_by_name: string;
  rejection_reason?: string;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY secret");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify JWT auth - allow both user tokens and trigger calls
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // If it's not the service role key being passed, validate as user token
      if (token !== SERVICE_ROLE_KEY) {
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authData?.user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      }
    }
    // Note: trigger-called requests via net.http_post may not have auth headers
    
    const payload: ProjectPayload = await req.json();
    console.log('Processing supply chain rejection notification for project:', payload.id);

    // Duplicate check
    const { data: existingNotifications } = await supabase
      .from('email_notifications')
      .select('id')
      .eq('project_id', payload.id)
      .eq('notification_type', 'supply_chain_rejection')
      .eq('project_status', 6)
      .gte('created_at', new Date(Date.now() - 30000).toISOString());

    if (existingNotifications && existingNotifications.length > 0) {
      console.log('Recent duplicate notification found for project', payload.id, '- skipping');
      return new Response(JSON.stringify({ message: 'Duplicate notification prevented' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const affectedLocations = Object.keys(payload.standort_verteilung || {}).filter(
      location => payload.standort_verteilung[location] > 0
    );

    if (affectedLocations.length === 0) {
      return new Response(JSON.stringify({ message: 'No affected locations' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const affectedPlanningRoles = affectedLocations.map(location => `planung_${location}`);
    const { data: supplyChainUsers, error: usersError } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .or(`role.in.(${affectedPlanningRoles.join(',')}),role.eq.admin,role.eq.supply_chain`);

    if (usersError || !supplyChainUsers || supplyChainUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const { data: allUsers, error: allUsersError } = await supabase.auth.admin.listUsers();
    if (allUsersError) {
      console.error('Error fetching all users:', allUsersError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const userEmailMap = new Map(allUsers.users.map(user => [user.id, user.email]));

    const recipients: Array<{ email: string, name: string, user_id: string }> = [];
    for (const user of supplyChainUsers) {
      const email = userEmailMap.get(user.user_id);
      if (email) {
        recipients.push({
          email,
          name: user.display_name || 'Mitarbeiter',
          user_id: user.user_id
        });
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ message: 'No valid email recipients' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const safeProjectNumber = escapeHtml(String(payload.project_number));
    const safeCustomer = escapeHtml(payload.customer);
    const safeArtikelNummer = escapeHtml(payload.artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(payload.artikel_bezeichnung);
    const safeCreatedByName = escapeHtml(payload.created_by_name);
    const safeRejectionReason = escapeHtml(payload.rejection_reason);
    const safeGesamtmenge = Number(payload.gesamtmenge) || 0;

    const locationDistributionHtml = affectedLocations.map(location => 
      `<li><strong>${escapeHtml(location)}:</strong> ${Number(payload.standort_verteilung[location]) || 0} kg</li>`
    ).join('');

    const emailContent = `
      <h1>🚨 ProPlan System – Projekt abgesagt (Standortbetroffenheit)</h1>
      <p>Sehr geehrtes Team,</p>
      <p>Ein genehmigtes Fertigungsprojekt wurde abgesagt. Ihr Standort ist von dieser Absage betroffen.</p>
      <hr>
      <h2>📋 Projektübersicht</h2>
      <ul>
        <li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li>
        <li><strong>🏢 Kunde:</strong> ${safeCustomer}</li>
        <li><strong>📦 Artikelnummer:</strong> ${safeArtikelNummer}</li>
        <li><strong>📋 Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li>
        <li><strong>📊 Gesamtmenge:</strong> ${safeGesamtmenge} kg</li>
        <li><strong>📅 Absage am:</strong> ${currentDate}</li>
        <li><strong>👤 Projektersteller:</strong> ${safeCreatedByName}</li>
      </ul>
      <hr>
      <h2>📍 Betroffene Standortverteilung</h2>
      <ul>${locationDistributionHtml}</ul>
      ${safeRejectionReason ? `
        <hr>
        <h2>📝 Ablehnungsgrund</h2>
        <div style="border: 2px solid #d32f2f; border-radius: 8px; padding: 16px; background-color: #ffebee; margin: 20px 0;">
          <p><strong>${safeRejectionReason}</strong></p>
        </div>
      ` : ''}
      <hr>
      <div style="border: 2px solid #ff9800; border-radius: 8px; padding: 16px; background-color: #fff8e1; margin: 20px 0;">
        <h3 style="color: #ff9800; margin-top: 0;">⚠️ Wichtiger Hinweis</h3>
        <p>Dieses Projekt war bereits genehmigt und wurde nachträglich abgesagt. Bitte prüfen Sie:</p>
        <ul>
          <li>Bereits begonnene Produktionsplanungen an den betroffenen Standorten</li>
          <li>Materialbestellungen und Lieferantenvereinbarungen</li>
          <li>Kapazitätsplanungen und Ressourcenzuteilungen</li>
          <li>Kundenkommunikation bezüglich Lieferterminen</li>
        </ul>
      </div>
      <p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p>
      <hr>
      <p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p>
      <p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>
    `;

    const emailPromises = recipients.map(async (recipient) => {
      const emailBody = {
        personalizations: [
          {
            to: [{ email: recipient.email, name: escapeHtml(recipient.name) }],
            subject: `🚨 ProPlan - Projekt #${safeProjectNumber} abgesagt (Standort betroffen)`
          }
        ],
        from: { email: "noreply@proplansystem.de", name: "ProPlan System" },
        content: [{ type: "text/html", value: emailContent }]
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailBody),
      });

      if (!response.ok) {
        console.error(`SendGrid error for ${recipient.email}:`, response.status);
        throw new Error(`Failed to send email to ${recipient.email}`);
      }

      if (recipient.user_id) {
        await supabase
          .from('email_notifications')
          .insert({
            project_id: payload.id,
            notification_type: 'supply_chain_rejection',
            user_id: recipient.user_id,
            email_address: recipient.email,
            project_status: 6,
            correction_reason: payload.rejection_reason
          });
      }

      return recipient.email;
    });

    const sentEmails = await Promise.allSettled(emailPromises);
    const successfulEmails = sentEmails
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<string>).value);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notifications sent',
        totalSent: successfulEmails.length
      }), 
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );

  } catch (error) {
    console.error('Error in send-project-rejection-supply-chain-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});

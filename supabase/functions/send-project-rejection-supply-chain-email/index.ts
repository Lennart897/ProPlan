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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
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
    
    const payload: ProjectPayload = await req.json();
    console.log('Processing supply chain rejection notification for project:', payload.id);

    // Check for recent duplicate notifications to prevent spam - check if ANY notification was sent for this project status change
    const { data: existingNotifications } = await supabase
      .from('email_notifications')
      .select('id')
      .eq('project_id', payload.id)
      .eq('notification_type', 'supply_chain_rejection')
      .eq('project_status', 6)
      .gte('created_at', new Date(Date.now() - 30000).toISOString()); // Last 30 seconds

    if (existingNotifications && existingNotifications.length > 0) {
      console.log('Recent duplicate notification found for project', payload.id, '- skipping to prevent spam');
      return new Response(JSON.stringify({ message: 'Duplicate notification prevented - already sent within last 30 seconds' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get affected locations from standort_verteilung
    const affectedLocations = Object.keys(payload.standort_verteilung || {}).filter(
      location => payload.standort_verteilung[location] > 0
    );

    if (affectedLocations.length === 0) {
      console.log('No affected locations found for project:', payload.id);
      return new Response(JSON.stringify({ message: 'No affected locations' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log('Affected locations:', affectedLocations);

    // Get planning users for affected locations and admin users as fallback
    const affectedPlanningRoles = affectedLocations.map(location => `planung_${location}`);
    const { data: supplyChainUsers, error: usersError } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .or(`role.in.(${affectedPlanningRoles.join(',')}),role.eq.admin,role.eq.supply_chain`); // Include planning users for affected locations, admin and supply_chain as fallback

    if (usersError) {
      console.error('Error fetching supply chain users:', usersError);
      return new Response('Error fetching users', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    if (!supplyChainUsers || supplyChainUsers.length === 0) {
      console.log('No planning, supply chain or admin users found');
      return new Response(JSON.stringify({ message: 'No planning, supply chain or admin users found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get all authenticated users to map user IDs to emails
    const { data: allUsers, error: allUsersError } = await supabase.auth.admin.listUsers();
    
    if (allUsersError) {
      console.error('Error fetching all users:', allUsersError);
      return new Response('Error fetching user emails', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Create a map of user IDs to emails
    const userEmailMap = new Map(
      allUsers.users.map(user => [user.id, user.email])
    );

    // Build recipient list
    const recipients: Array<{ email: string, name: string, user_id: string }> = [];
    
    for (const user of supplyChainUsers) {
      const email = userEmailMap.get(user.user_id);
      if (email) {
        const userName = user.display_name || 
          (user.role === 'admin' ? 'Administrator' : 
           user.role === 'supply_chain' ? 'SupplyChain Mitarbeiter' : 
           'Planungsmitarbeiter');
        recipients.push({
          email,
          name: userName,
          user_id: user.user_id
        });
      }
    }

    if (recipients.length === 0) {
      console.log('No valid email recipients found');
      return new Response(JSON.stringify({ message: 'No valid email recipients' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`Sending notifications to ${recipients.length} planning/supply chain/admin users for affected locations:`, affectedLocations);

    // Format the current date
    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Format location distribution for email
    const locationDistributionHtml = affectedLocations.map(location => 
      `<li><strong>${location}:</strong> ${payload.standort_verteilung[location]} Stück</li>`
    ).join('');

    // Professional email content for supply chain users
    const emailContent = `
      <h1>🚨 ProPlan System – Projekt abgesagt (Standortbetroffenheit)</h1>
      <p>Sehr geehrtes Team,</p>
      <p>Ein genehmigtes Fertigungsprojekt wurde abgesagt. Ihr Standort ist von dieser Absage betroffen.</p>
      
      <hr>
      <h2>📋 Projektübersicht</h2>
      <ul>
        <li><strong>Projekt-Nr.:</strong> #${payload.project_number}</li>
        <li><strong>🏢 Kunde:</strong> ${payload.customer}</li>
        <li><strong>📦 Artikelnummer:</strong> ${payload.artikel_nummer}</li>
        <li><strong>📋 Artikelbezeichnung:</strong> ${payload.artikel_bezeichnung}</li>
        <li><strong>📊 Gesamtmenge:</strong> ${payload.gesamtmenge} Stück</li>
        <li><strong>📅 Absage am:</strong> ${currentDate}</li>
        <li><strong>👤 Projektersteller:</strong> ${payload.created_by_name}</li>
      </ul>

      ${payload.erste_anlieferung ? `<li><strong>🚚 Erste Anlieferung:</strong> ${new Date(payload.erste_anlieferung).toLocaleDateString('de-DE')}</li>` : ''}
      ${payload.letzte_anlieferung ? `<li><strong>🏁 Letzte Anlieferung:</strong> ${new Date(payload.letzte_anlieferung).toLocaleDateString('de-DE')}</li>` : ''}
      
      <hr>
      <h2>📍 Betroffene Standortverteilung</h2>
      <ul>
        ${locationDistributionHtml}
      </ul>

      ${payload.rejection_reason ? `
        <hr>
        <h2>📝 Ablehnungsgrund</h2>
        <div style="border: 2px solid #d32f2f; border-radius: 8px; padding: 16px; background-color: #ffebee; margin: 20px 0;">
          <p><strong>${payload.rejection_reason}</strong></p>
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

      <p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p>
      
      <hr>
      <p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p>
      <p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em><br>Bei Rückfragen wenden Sie sich bitte an die Projektverantwortlichen.</p>
    `;

    // Send emails to all supply chain users
    const emailPromises = recipients.map(async (recipient) => {
      const emailBody = {
        personalizations: [
          {
            to: [{ 
              email: recipient.email, 
              name: recipient.name 
            }],
            subject: `🚨 ProPlan - Projekt #${payload.project_number} abgesagt (Standort betroffen)`
          }
        ],
        from: { 
          email: "ProPlanPost@outlook.com", 
          name: "ProPlan System" 
        },
        content: [
          {
            type: "text/html",
            value: emailContent
          }
        ]
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
        const errorText = await response.text();
        console.error(`SendGrid error for ${recipient.email}:`, response.status, errorText);
        throw new Error(`Failed to send email to ${recipient.email}`);
      }

      // Record the email notification - use recipient's user_id if available, otherwise skip
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

    const failedEmails = sentEmails
      .filter(result => result.status === 'rejected')
      .map(result => (result as PromiseRejectedResult).reason);

    console.log(`Project rejection emails sent successfully to affected locations: ${successfulEmails.join(', ')}`);
    if (failedEmails.length > 0) {
      console.error('Some emails failed:', failedEmails);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Project rejection notifications sent to affected locations',
        recipients: successfulEmails,
        affectedLocations,
        totalSent: successfulEmails.length,
        totalFailed: failedEmails.length
      }), 
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    console.error('Error in send-project-rejection-supply-chain-email function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }), 
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }
});
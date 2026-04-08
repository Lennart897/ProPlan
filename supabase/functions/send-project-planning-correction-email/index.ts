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
  created_by_id: string;
  created_by_name: string;
  correction_reason?: string;
  corrected_by_id: string;
  corrected_by_name: string;
  old_gesamtmenge: number;
  new_gesamtmenge: number;
  old_standort_verteilung: any;
  new_standort_verteilung: any;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey || !sendGridApiKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const payload: ProjectPayload = await req.json();
    console.log('Processing planning correction notification for project:', payload.id);

    // Duplicate check
    const { data: recentNotification } = await supabase
      .from('email_notifications')
      .select('id')
      .eq('project_id', payload.id)
      .eq('notification_type', 'planning_correction')
      .eq('project_status', 3)
      .gte('created_at', new Date(Date.now() - 10000).toISOString())
      .maybeSingle();

    if (recentNotification) {
      console.log('Duplicate notification detected - skipping');
      return new Response(JSON.stringify({ message: 'Duplicate notification prevented' }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const { data: supplyChainProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .eq('role', 'supply_chain');

    if (profilesError || !supplyChainProfiles || supplyChainProfiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No supply chain users to notify' }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const userEmailMap = new Map<string, string>();
    users.forEach(user => {
      if (user.email) userEmailMap.set(user.id, user.email);
    });

    const recipients = supplyChainProfiles
      .map(profile => ({
        email: userEmailMap.get(profile.user_id),
        name: profile.display_name || 'SupplyChain Nutzer'
      }))
      .filter((r): r is { email: string; name: string } => Boolean(r.email));

    // Deduplicate
    const seen = new Set<string>();
    const uniqueRecipients = recipients.filter(r => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });

    if (uniqueRecipients.length === 0) {
      return new Response(JSON.stringify({ message: 'No valid recipients found' }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const currentDate = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });

    const safeProjectNumber = escapeHtml(payload.project_number);
    const safeCustomer = escapeHtml(payload.customer);
    const safeArtikelNummer = escapeHtml(payload.artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(payload.artikel_bezeichnung);
    const safeCreatedByName = escapeHtml(payload.created_by_name);
    const safeCorrectedByName = escapeHtml(payload.corrected_by_name);
    const safeCorrectionReason = escapeHtml(payload.correction_reason);

    const formatLocationDistribution = (locations: any) => {
      if (!locations || typeof locations !== 'object') return 'Keine Standortverteilung';
      return Object.entries(locations)
        .filter(([_, quantity]) => Number(quantity) > 0)
        .map(([location, quantity]) => `${escapeHtml(location)}: ${Number(quantity)} Stück`)
        .join(', ');
    };

    const oldMenge = Number(payload.old_gesamtmenge) || 0;
    const newMenge = Number(payload.new_gesamtmenge) || 0;
    const mengeDiff = newMenge - oldMenge;

    const quantityComparisonHtml = `
      <hr><h2>📊 Mengenänderungen</h2>
      <div style="border: 2px solid #4caf50; border-radius: 8px; padding: 16px; background-color: #f1f8e9; margin: 20px 0;">
        <h3 style="color: #4caf50; margin-top: 0;">Gesamtmenge</h3>
        <p><strong>Vorher:</strong> ${oldMenge.toLocaleString()} Stück</p>
        <p><strong>Nachher:</strong> ${newMenge.toLocaleString()} Stück</p>
        ${oldMenge !== newMenge ? 
          `<p style="color: #f57c00;"><strong>Änderung:</strong> ${mengeDiff > 0 ? '+' : ''}${mengeDiff.toLocaleString()} Stück</p>` : 
          '<p style="color: #4caf50;"><strong>Keine Änderung der Gesamtmenge</strong></p>'}
      </div>
      <div style="border: 2px solid #9c27b0; border-radius: 8px; padding: 16px; background-color: #f3e5f5; margin: 20px 0;">
        <h3 style="color: #9c27b0; margin-top: 0;">Standortverteilung</h3>
        <p><strong>Vorher:</strong><br>${formatLocationDistribution(payload.old_standort_verteilung)}</p>
        <p><strong>Nachher:</strong><br>${formatLocationDistribution(payload.new_standort_verteilung)}</p>
      </div>`;

    const professionalEmailContent = `<h1>🔄 ProPlan System – Projekt wurde von Planung korrigiert</h1><p>Sehr geehrtes SupplyChain-Team,</p><p>Ein Fertigungsprojekt wurde von der Planung geprüft und korrigiert.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li><li><strong>🏢 Kunde:</strong> ${safeCustomer}</li><li><strong>📦 Artikelnummer:</strong> ${safeArtikelNummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li><li><strong>👤 Projektersteller:</strong> ${safeCreatedByName}</li><li><strong>⚙️ Bearbeitet von:</strong> ${safeCorrectedByName}</li><li><strong>📅 Korrektur am:</strong> ${currentDate}</li></ul>${quantityComparisonHtml}${safeCorrectionReason ? `<hr><h2>📝 Korrekturgrund</h2><div style="border: 2px solid #ff9800; border-radius: 8px; padding: 16px; background-color: #fff8e1; margin: 20px 0;"><p><strong>${safeCorrectionReason}</strong></p></div>` : ''}<hr><div style="border: 2px solid #2196f3; border-radius: 8px; padding: 16px; background-color: #e3f2fd; margin: 20px 0;"><h3 style="color: #2196f3; margin-top: 0;">💡 Nächste Schritte</h3><p>Bitte prüfen Sie das korrigierte Projekt erneut.</p></div><p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>`;

    const emailPromises = uniqueRecipients.map(async (recipient) => {
      const emailBody = {
        personalizations: [
          {
            to: [{ email: recipient.email, name: escapeHtml(recipient.name) }],
            subject: `🔄 ProPlan - Projekt #${safeProjectNumber} wurde von Planung korrigiert`
          }
        ],
        from: { email: "noreply@proplansystem.de", name: "ProPlan System" },
        content: [{ type: "text/html", value: professionalEmailContent }]
      };

      const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendGridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailBody),
      });

      if (!emailResponse.ok) {
        console.error(`SendGrid error for ${recipient.email}:`, emailResponse.status);
        throw new Error(`Failed to send email to ${recipient.email}`);
      }

      return recipient.email;
    });

    const sentEmails = await Promise.all(emailPromises);

    // Record notifications
    try {
      await supabase
        .from('email_notifications')
        .insert(
          sentEmails.map(email => ({
            project_id: payload.id,
            notification_type: 'planning_correction',
            user_id: payload.corrected_by_id,
            email_address: email,
            project_status: 3,
            correction_reason: payload.correction_reason || ''
          }))
        );
    } catch (recordError) {
      console.error('Error recording notifications:', recordError);
    }

    return new Response(
      JSON.stringify({ success: true, count: sentEmails.length }), 
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error in send-project-planning-correction-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});

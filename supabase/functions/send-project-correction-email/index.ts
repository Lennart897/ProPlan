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
    console.log('Processing project correction notification for project:', payload.id);

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(payload.created_by_id);
    
    if (authError || !authUser.user?.email) {
      console.error('Error fetching creator email:', authError);
      return new Response(JSON.stringify({ error: 'Could not find project creator email' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const creatorEmail = authUser.user.email;
    const safeCreatorName = escapeHtml(payload.created_by_name);
    const safeProjectNumber = escapeHtml(payload.project_number);
    const safeCustomer = escapeHtml(payload.customer);
    const safeArtikelNummer = escapeHtml(payload.artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(payload.artikel_bezeichnung);
    const safeCorrectionReason = escapeHtml(payload.correction_reason);

    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const professionalEmailContent = `<h1>🔄 ProPlan System – Ihr Projekt wurde korrigiert</h1><p>Sehr geehrte/r ${safeCreatorName},</p><p>Ihr Fertigungsprojekt wurde von der SupplyChain-Abteilung geprüft und korrigiert. Das Projekt wurde zur erneuten Prüfung an den Vertrieb zurückgesendet.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li><li><strong>🏢 Kunde:</strong> ${safeCustomer}</li><li><strong>📦 Artikelnummer:</strong> ${safeArtikelNummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li><li><strong>📅 Korrektur am:</strong> ${currentDate}</li></ul>${safeCorrectionReason ? `<hr><h2>📝 Korrekturgrund</h2><div style="border: 2px solid #ff9800; border-radius: 8px; padding: 16px; background-color: #fff8e1; margin: 20px 0;"><p><strong>${safeCorrectionReason}</strong></p></div>` : ''}<hr><div style="border: 2px solid #2196f3; border-radius: 8px; padding: 16px; background-color: #e3f2fd; margin: 20px 0;"><h3 style="color: #2196f3; margin-top: 0;">💡 Nächste Schritte</h3><p>Das Projekt wurde mit Korrekturen an die Gesamtmenge oder Standortverteilung an den Vertrieb zurückgesendet.</p><p>Der Vertrieb wird das korrigierte Projekt erneut prüfen und gegebenenfalls weitere Schritte einleiten.</p></div><p>🔗 <a href="https://demo-proplan.de" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>`;

    const emailBody = {
      personalizations: [
        {
          to: [{ email: creatorEmail, name: safeCreatorName }],
          subject: `🔄 ProPlan - Ihr Projekt #${safeProjectNumber} wurde korrigiert`
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
      console.error('SendGrid error:', emailResponse.status);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log('Project correction email sent successfully to:', creatorEmail);

    return new Response(
      JSON.stringify({ success: true, message: 'Correction notification sent successfully' }), 
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error in send-project-correction-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});

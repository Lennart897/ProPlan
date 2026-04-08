import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProjectPayload {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge: number;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  beschreibung?: string;
  standort_verteilung?: Record<string, number>;
  created_by_id?: string;
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
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey || !sendgridApiKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const project: ProjectPayload = await req.json();
    console.log('Processing project approval notification:', project.project_number);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!project.created_by_id) {
      return new Response(JSON.stringify({ message: 'No project creator found' }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(project.created_by_id);
    
    if (authError || !authUser.user?.email) {
      console.error('Error fetching creator email:', authError);
      return new Response(JSON.stringify({ error: 'Could not find creator email' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const safeCreatedByName = escapeHtml(project.created_by_name);
    const safeProjectNumber = escapeHtml(String(project.project_number));
    const safeCustomer = escapeHtml(project.customer);
    const safeArtikelNummer = escapeHtml(project.artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(project.artikel_bezeichnung);
    const safeBeschreibung = escapeHtml(project.beschreibung);
    const safeGesamtmenge = Number(project.gesamtmenge) || 0;

    const formatDate = (dateStr?: string): string => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (qty: number): string => {
      return new Intl.NumberFormat('de-DE').format(qty);
    };

    const formatLocationDistribution = (distribution?: Record<string, number>): string => {
      if (!distribution) return '<li>Keine Standortverteilung verfügbar</li>';
      return Object.entries(distribution)
        .filter(([_, quantity]) => quantity > 0)
        .map(([location, quantity]) => `<li><strong>${escapeHtml(location)}:</strong> ${formatQuantity(quantity)} Stück</li>`)
        .join('');
    };

    const htmlContent = `<h1>🎉 ProPlan System – Ihr Projekt wurde genehmigt!</h1>
<p>Hallo ${safeCreatedByName},</p>
<p>Ihr Fertigungsprojekt wurde erfolgreich von allen beteiligten Standorten genehmigt!</p>
<hr>
<h2>📊 Projektübersicht</h2>
<ul>
  <li><strong>Projekt-Nr.:</strong> #${safeProjectNumber}</li>
  <li><strong>Kunde:</strong> ${safeCustomer}</li>
  <li><strong>Artikelnummer:</strong> ${safeArtikelNummer}</li>
  <li><strong>Artikelbezeichnung:</strong> ${safeArtikelBezeichnung}</li>
  <li><strong>Gesamtmenge:</strong> ${formatQuantity(safeGesamtmenge)} Stück</li>
  <li><strong>Erste Anlieferung:</strong> 📅 ${formatDate(project.erste_anlieferung)}</li>
  <li><strong>Letzte Anlieferung:</strong> 📅 ${formatDate(project.letzte_anlieferung)}</li>
  <li><strong>Erstellt von:</strong> ${safeCreatedByName}</li>
</ul>
${safeBeschreibung ? `<h2>📝 Beschreibung</h2><p>${safeBeschreibung}</p>` : ''}
<h2>📍 Standortverteilung</h2>
<ul>${formatLocationDistribution(project.standort_verteilung)}</ul>
<hr>
<div style="background-color: #e8f5e8; border-left: 4px solid #4caf50; padding: 16px; margin: 16px 0;">
  <h2 style="margin-top: 0; color: #2e7d32;">✅ Status: Vollständig genehmigt</h2>
  <p style="margin-bottom: 0;"><strong>Alle Standorte haben Ihr Projekt genehmigt. Die Produktion kann beginnen!</strong></p>
</div>
<p>🔗 <a href="https://demo-proplan.de" style="color: #2196f3;">Zum Projekt im ProPlan System</a></p>
<hr>
<p style="color: #666; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>
<p><strong>Mit freundlichen Grüßen,<br>ProPlan Benachrichtigungssystem</strong></p>`;

    const sendgridPayload = {
      personalizations: [
        {
          to: [{ email: authUser.user.email }],
          subject: `✅ ProPlan - Projekt genehmigt: #${safeProjectNumber}`
        }
      ],
      from: { email: "noreply@proplansystem.de", name: "ProPlan System" },
      content: [{ type: "text/html", value: htmlContent }]
    };

    const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sendgridApiKey}`
      },
      body: JSON.stringify(sendgridPayload)
    });

    if (!sendgridResponse.ok) {
      console.error('SendGrid API error:', sendgridResponse.status);
      throw new Error(`SendGrid API failed: ${sendgridResponse.status}`);
    }

    console.log('Project approval email sent successfully');
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error in send-project-approval-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});

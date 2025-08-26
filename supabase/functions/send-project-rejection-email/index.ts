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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey || !sendGridApiKey) {
      console.error('Missing required environment variables');
      return new Response('Server configuration error', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const payload: ProjectPayload = await req.json();
    console.log('Processing project rejection notification for project:', payload.id);

    // Get the creator's email from auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(payload.created_by_id);
    
    if (authError || !authUser.user?.email) {
      console.error('Error fetching creator email:', authError);
      return new Response('Could not find project creator email', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const creatorEmail = authUser.user.email;
    const creatorName = payload.created_by_name;
    
    console.log(`Sending rejection notification to creator: ${creatorEmail}`);

    // Format the current date
    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Professional email content for project creator
    const professionalEmailContent = `<h1>❌ ProPlan System – Ihr Projekt wurde abgesagt</h1><p>Sehr geehrte/r ${creatorName},</p><p>Ihr Fertigungsprojekt wurde von der SupplyChain-Abteilung geprüft und leider abgesagt.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${payload.project_number}</li><li><strong>🏢 Kunde:</strong> ${payload.customer}</li><li><strong>📦 Artikelnummer:</strong> ${payload.artikel_nummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${payload.artikel_bezeichnung}</li><li><strong>📅 Absage am:</strong> ${currentDate}</li></ul>${payload.rejection_reason ? `<hr><h2>📝 Ablehnungsgrund</h2><div style="border: 2px solid #d32f2f; border-radius: 8px; padding: 16px; background-color: #ffebee; margin: 20px 0;"><p><strong>${payload.rejection_reason}</strong></p></div>` : ''}<hr><div style="border: 2px solid #ff9800; border-radius: 8px; padding: 16px; background-color: #fff8e1; margin: 20px 0;"><h3 style="color: #ff9800; margin-top: 0;">💡 Nächste Schritte</h3><p>Falls Sie Fragen zum Ablehnungsgrund haben oder eine überarbeitete Version des Projekts einreichen möchten, wenden Sie sich bitte an die SupplyChain-Abteilung.</p><p>Sie können auch ein neues Projekt mit angepassten Parametern erstellen.</p></div><p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em><br>Bei Rückfragen wenden Sie sich bitte an die SupplyChain-Abteilung.</p>`;

    // Send email to project creator via SendGrid
    const emailBody = {
      personalizations: [
        {
          to: [{ 
            email: creatorEmail, 
            name: creatorName 
          }],
          subject: `❌ ProPlan - Ihr Projekt #${payload.project_number} wurde abgesagt`
        }
      ],
      from: { 
        email: "ProPlanPost@outlook.com", 
        name: "ProPlan System" 
      },
      content: [
        {
          type: "text/html",
          value: professionalEmailContent
        }
      ]
    };

    // Send email via SendGrid
    const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('SendGrid error:', emailResponse.status, errorText);
      return new Response('Failed to send email', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('Project rejection email sent successfully to:', creatorEmail);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Project rejection notification sent successfully',
        recipient: creatorEmail
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
    console.error('Error in send-project-rejection-email function:', error);
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
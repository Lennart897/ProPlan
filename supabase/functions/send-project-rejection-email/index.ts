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

    // Prepare email content
    const emailBody = {
      personalizations: [
        {
          to: [{ 
            email: creatorEmail, 
            name: creatorName 
          }],
          subject: `Ihr Projekt ${payload.project_number} wurde durch SupplyChain abgesagt`
        }
      ],
      from: { 
        email: "noreply@example.com", 
        name: "Systembenachrichtigung" 
      },
      content: [
        {
          type: "text/html",
          value: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #d32f2f;">Projekt abgesagt</h2>
              <p>Guten Tag <strong>${creatorName}</strong>,</p>
              <p>Ihr Projekt <strong>${payload.project_number}</strong> wurde von der SupplyChain-Abteilung am <strong>${currentDate}</strong> abgesagt und in den Status 6 verschoben.</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <h3 style="margin-top: 0; color: #333;">Projektdetails:</h3>
                <p><strong>Projektnummer:</strong> ${payload.project_number}</p>
                <p><strong>Kunde:</strong> ${payload.customer}</p>
                <p><strong>Artikel:</strong> ${payload.artikel_nummer} - ${payload.artikel_bezeichnung}</p>
                ${payload.rejection_reason ? `<p><strong>Ablehnungsgrund:</strong> ${payload.rejection_reason}</p>` : ''}
              </div>
              
              <p>Bei Fragen wenden Sie sich bitte an die SupplyChain-Abteilung.</p>
              
              <p>Mit freundlichen Grüßen,<br>Ihr Projektmanagement-System</p>
            </div>
          `
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
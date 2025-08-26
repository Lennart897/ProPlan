import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProjectPayload {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  created_by_id: string;
  created_by_name: string;
  correction_reason?: string;
}

serve(async (req) => {
  console.log('Project correction email function called');
  
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !sendgridApiKey) {
      console.error('Missing environment variables');
      return new Response('Server configuration error', { 
        status: 500,
        headers: corsHeaders 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: ProjectPayload = await req.json();

    console.log('Processing project correction for:', payload.project_number);

    // Get creator's email from Supabase Auth
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(payload.created_by_id);
    
    if (userError || !userData.user?.email) {
      console.error('Error fetching user data:', userError);
      return new Response('User not found', { 
        status: 404,
        headers: corsHeaders 
      });
    }

    const creatorEmail = userData.user.email;
    console.log('Sending correction email to:', creatorEmail);

    // Prepare email content
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Projektkorrektur durch SupplyChain</h2>
        
        <p>Hallo ${payload.created_by_name},</p>
        
        <p>Ihr Projekt wurde von der SupplyChain korrigiert und benötigt eine erneute Prüfung durch den Vertrieb.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #495057;">Projektdetails:</h3>
          <p><strong>Projektnummer:</strong> ${payload.project_number}</p>
          <p><strong>Kunde:</strong> ${payload.customer}</p>
          <p><strong>Artikel-Nr.:</strong> ${payload.artikel_nummer}</p>
          <p><strong>Artikel-Bezeichnung:</strong> ${payload.artikel_bezeichnung}</p>
        </div>
        
        ${payload.correction_reason ? `
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #856404;">Korrekturgrund:</h4>
          <p style="margin-bottom: 0;">${payload.correction_reason}</p>
        </div>
        ` : ''}
        
        <p>Das Projekt wurde zur erneuten Prüfung an den Vertrieb zurückgesendet. Bitte prüfen Sie die Änderungen und nehmen Sie gegebenenfalls weitere Anpassungen vor.</p>
        
        <p>Mit freundlichen Grüßen<br>
        Ihr Manufacturing Team</p>
      </div>
    `;

    // Send email via SendGrid
    const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: creatorEmail, name: payload.created_by_name }],
          subject: `Projektkorrektur - ${payload.project_number}: ${payload.customer}`,
        }],
        from: {
          email: Deno.env.get('SENDER_EMAIL') || 'noreply@manufacturing.com',
          name: 'Manufacturing System'
        },
        content: [{
          type: 'text/html',
          value: emailContent
        }]
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('SendGrid API error:', errorText);
      return new Response('Failed to send email', { 
        status: 500,
        headers: corsHeaders 
      });
    }

    console.log('Project correction email sent successfully');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-project-correction-email function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
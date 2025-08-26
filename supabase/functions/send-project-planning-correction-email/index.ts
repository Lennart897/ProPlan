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

serve(async (req) => {
  console.log('=== PROJECT PLANNING CORRECTION EMAIL FUNCTION CALLED ===');
  console.log('Request method:', req.method);
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));
  
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
    console.log('Processing planning correction notification for project:', payload.id);

    // Get all users with supply_chain role
    const { data: supplyChainProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .eq('role', 'supply_chain');

    if (profilesError) {
      console.error('Error fetching supply chain profiles:', profilesError);
      return new Response('Could not find supply chain users', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    if (!supplyChainProfiles || supplyChainProfiles.length === 0) {
      console.log('No supply chain users found');
      return new Response('No supply chain users to notify', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    // Get all auth users to map user IDs to emails
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return new Response('Could not fetch user emails', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Create a map of user IDs to emails
    const userEmailMap = new Map();
    users.forEach(user => {
      if (user.email) {
        userEmailMap.set(user.id, user.email);
      }
    });

    // Find valid recipients
    const recipients = supplyChainProfiles
      .map(profile => ({
        email: userEmailMap.get(profile.user_id),
        name: profile.display_name || 'SupplyChain Nutzer'
      }))
      .filter(recipient => recipient.email);

    if (recipients.length === 0) {
      console.log('No valid email addresses found for supply chain users');
      return new Response('No valid recipients found', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    console.log(`Found ${recipients.length} supply chain recipients`);

    // Format the current date
    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Helper function to format location distribution
    const formatLocationDistribution = (locations: any) => {
      if (!locations || typeof locations !== 'object') return 'Keine Standortverteilung';
      
      const entries = Object.entries(locations);
      if (entries.length === 0) return 'Keine Standortverteilung';
      
      return entries
        .filter(([_, quantity]) => Number(quantity) > 0)
        .map(([location, quantity]) => `${location}: ${quantity} Stück`)
        .join(', ');
    };

    // Generate quantity comparison section
    const quantityComparisonHtml = `
      <hr>
      <h2>📊 Mengenänderungen</h2>
      <div style="border: 2px solid #4caf50; border-radius: 8px; padding: 16px; background-color: #f1f8e9; margin: 20px 0;">
        <h3 style="color: #4caf50; margin-top: 0;">Gesamtmenge</h3>
        <p><strong>Vorher:</strong> ${payload.old_gesamtmenge?.toLocaleString() || 0} Stück</p>
        <p><strong>Nachher:</strong> ${payload.new_gesamtmenge?.toLocaleString() || 0} Stück</p>
        ${payload.old_gesamtmenge !== payload.new_gesamtmenge ? 
          `<p style="color: #f57c00;"><strong>Änderung:</strong> ${((payload.new_gesamtmenge || 0) - (payload.old_gesamtmenge || 0)) > 0 ? '+' : ''}${((payload.new_gesamtmenge || 0) - (payload.old_gesamtmenge || 0)).toLocaleString()} Stück</p>` : 
          '<p style="color: #4caf50;"><strong>Keine Änderung der Gesamtmenge</strong></p>'
        }
      </div>
      
      <div style="border: 2px solid #9c27b0; border-radius: 8px; padding: 16px; background-color: #f3e5f5; margin: 20px 0;">
        <h3 style="color: #9c27b0; margin-top: 0;">Standortverteilung</h3>
        <p><strong>Vorher:</strong><br>${formatLocationDistribution(payload.old_standort_verteilung)}</p>
        <p><strong>Nachher:</strong><br>${formatLocationDistribution(payload.new_standort_verteilung)}</p>
      </div>
    `;

    // Professional email content for supply chain team
    const professionalEmailContent = `<h1>🔄 ProPlan System – Projekt wurde von Planung korrigiert</h1><p>Sehr geehrtes SupplyChain-Team,</p><p>Ein Fertigungsprojekt wurde von der Planung geprüft und korrigiert. Das Projekt wurde zur erneuten Prüfung an SupplyChain zurückgesendet.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${payload.project_number}</li><li><strong>🏢 Kunde:</strong> ${payload.customer}</li><li><strong>📦 Artikelnummer:</strong> ${payload.artikel_nummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${payload.artikel_bezeichnung}</li><li><strong>👤 Projektersteller:</strong> ${payload.created_by_name}</li><li><strong>⚙️ Bearbeitet von:</strong> ${payload.corrected_by_name}</li><li><strong>📅 Korrektur am:</strong> ${currentDate}</li></ul>${quantityComparisonHtml}${payload.correction_reason ? `<hr><h2>📝 Korrekturgrund</h2><div style="border: 2px solid #ff9800; border-radius: 8px; padding: 16px; background-color: #fff8e1; margin: 20px 0;"><p><strong>${payload.correction_reason}</strong></p></div>` : ''}<hr><div style="border: 2px solid #2196f3; border-radius: 8px; padding: 16px; background-color: #e3f2fd; margin: 20px 0;"><h3 style="color: #2196f3; margin-top: 0;">💡 Nächste Schritte</h3><p>Das Projekt wurde mit Korrekturen an der Gesamtmenge oder Standortverteilung von der Planung an SupplyChain zurückgesendet.</p><p>Bitte prüfen Sie das korrigierte Projekt erneut und leiten gegebenenfalls weitere Schritte ein.</p></div><p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>Ihr ProPlan Team</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em><br>Bei Rückfragen wenden Sie sich bitte an die Planungsabteilung.</p>`;

    // Send emails to all supply chain users
    const emailPromises = recipients.map(async (recipient) => {
      const emailBody = {
        personalizations: [
          {
            to: [{ 
              email: recipient.email, 
              name: recipient.name 
            }],
            subject: `🔄 ProPlan - Projekt #${payload.project_number} wurde von Planung korrigiert`
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
        console.error(`SendGrid error for ${recipient.email}:`, emailResponse.status, errorText);
        throw new Error(`Failed to send email to ${recipient.email}`);
      }

      console.log('Planning correction email sent successfully to:', recipient.email);
      return recipient.email;
    });

    // Wait for all emails to be sent
    const sentEmails = await Promise.all(emailPromises);

    console.log(`All planning correction emails sent successfully to: ${sentEmails.join(', ')}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Planning correction notifications sent successfully',
        recipients: sentEmails,
        count: sentEmails.length
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
    console.error('Error in send-project-planning-correction-email function:', error);
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
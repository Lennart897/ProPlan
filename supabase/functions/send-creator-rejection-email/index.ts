import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  gesamtmenge: number;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  beschreibung?: string;
  standort_verteilung: Record<string, number>;
  created_by_id: string;
  created_by_name: string;
  rejected_by_id: string;
  rejected_by_name: string;
  rejection_reason?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const senderEmail = Deno.env.get('SENDER_EMAIL');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    if (!sendgridApiKey || !senderEmail) {
      throw new Error('Missing SendGrid environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const projectData: ProjectPayload = await req.json();

    console.log('Processing creator rejection for project:', projectData.project_number);

    // Get affected locations from standort_verteilung
    const affectedLocations = Object.entries(projectData.standort_verteilung)
      .filter(([_, quantity]) => quantity > 0)
      .map(([location, _]) => location);

    console.log('Affected locations:', affectedLocations);

    // Get planning users for affected locations
    const { data: planningUsers } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .or(
        affectedLocations
          .map(location => `role.eq.planung_${location.toLowerCase()}`)
          .join(',')
      );

    // Get supply chain users
    const { data: supplyChainUsers } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .eq('role', 'supply_chain');

    // Combine all users who should receive notifications
    const notificationUsers = [...(planningUsers || []), ...(supplyChainUsers || [])];

    console.log('Found notification users:', notificationUsers.length);

    if (notificationUsers.length === 0) {
      console.log('No users found for notifications');
      return new Response(JSON.stringify({ message: 'No users found for notifications' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all auth users to map user IDs to email addresses
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const userEmailMap = new Map(authUsers.users.map(user => [user.id, user.email]));

    // Prepare emails for all recipients
    const emailPromises = notificationUsers.map(async (user) => {
      const userEmail = userEmailMap.get(user.user_id);
      if (!userEmail) {
        console.log(`No email found for user ${user.user_id}`);
        return null;
      }

      const locationDistribution = Object.entries(projectData.standort_verteilung)
        .filter(([_, quantity]) => quantity > 0)
        .map(([location, quantity]) => `${location}: ${quantity}`)
        .join(', ');

      const emailData = {
        personalizations: [
          {
            to: [{ email: userEmail, name: user.display_name || userEmail }],
            subject: `Projekt ${projectData.project_number} vom Ersteller abgesagt`,
          },
        ],
        from: { email: senderEmail, name: 'Projekt Management System' },
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">Projekt vom Ersteller abgesagt</h2>
                
                <p>Das folgende Projekt wurde vom Ersteller abgesagt:</p>
                
                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #374151;">Projektdetails</h3>
                  <p><strong>Projektnummer:</strong> ${projectData.project_number}</p>
                  <p><strong>Kunde:</strong> ${projectData.customer}</p>
                  <p><strong>Artikel:</strong> ${projectData.artikel_nummer} - ${projectData.artikel_bezeichnung}</p>
                  <p><strong>Gesamtmenge:</strong> ${projectData.gesamtmenge}</p>
                  ${projectData.erste_anlieferung ? `<p><strong>Erste Anlieferung:</strong> ${new Date(projectData.erste_anlieferung).toLocaleDateString('de-DE')}</p>` : ''}
                  ${projectData.letzte_anlieferung ? `<p><strong>Letzte Anlieferung:</strong> ${new Date(projectData.letzte_anlieferung).toLocaleDateString('de-DE')}</p>` : ''}
                  <p><strong>Standortverteilung:</strong> ${locationDistribution}</p>
                  ${projectData.beschreibung ? `<p><strong>Beschreibung:</strong> ${projectData.beschreibung}</p>` : ''}
                </div>

                <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                  <h3 style="margin-top: 0; color: #dc2626;">Absage-Information</h3>
                  <p><strong>Abgesagt von:</strong> ${projectData.rejected_by_name} (Projektersteller)</p>
                  <p><strong>Ursprünglich erstellt von:</strong> ${projectData.created_by_name}</p>
                  ${projectData.rejection_reason ? `<p><strong>Grund:</strong> ${projectData.rejection_reason}</p>` : ''}
                </div>

                <p>Dieses Projekt ist nun als "Abgelehnt" markiert und erfordert keine weiteren Aktionen von Ihrer Seite.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                <p style="font-size: 12px; color: #6b7280;">
                  Diese E-Mail wurde automatisch vom Projekt Management System gesendet.
                </p>
              </div>
            `,
          },
        ],
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send email to ${userEmail}:`, response.status, errorText);
        return null;
      }

      console.log(`Creator rejection email sent successfully to ${userEmail}`);
      return userEmail;
    });

    const results = await Promise.allSettled(emailPromises);
    const successfulEmails = results
      .filter((result): result is PromiseFulfilledResult<string | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);

    console.log(`Successfully sent ${successfulEmails.length} creator rejection emails`);

    return new Response(JSON.stringify({ 
      message: 'Creator rejection emails sent successfully',
      recipients: successfulEmails,
      total: successfulEmails.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-creator-rejection-email function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
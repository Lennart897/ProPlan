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

serve(async (req: Request) => {
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

    const affectedLocations = Object.entries(projectData.standort_verteilung || {})
      .filter(([_, quantity]) => quantity > 0)
      .map(([location]) => location);

    const { data: planningUsers } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .or(
        affectedLocations
          .map(location => `role.eq.planung_${location.toLowerCase()}`)
          .join(',')
      );

    const { data: supplyChainUsers } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .eq('role', 'supply_chain');

    const notificationUsers = [...(planningUsers || []), ...(supplyChainUsers || [])];

    if (notificationUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found for notifications' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const userEmailMap = new Map(authUsers.users.map(user => [user.id, user.email]));

    const safeProjectNumber = escapeHtml(String(projectData.project_number));
    const safeCustomer = escapeHtml(projectData.customer);
    const safeArtikelNummer = escapeHtml(projectData.artikel_nummer);
    const safeArtikelBezeichnung = escapeHtml(projectData.artikel_bezeichnung);
    const safeCreatedByName = escapeHtml(projectData.created_by_name);
    const safeRejectedByName = escapeHtml(projectData.rejected_by_name);
    const safeRejectionReason = escapeHtml(projectData.rejection_reason);
    const safeBeschreibung = escapeHtml(projectData.beschreibung);
    const safeGesamtmenge = Number(projectData.gesamtmenge) || 0;

    const locationDistribution = Object.entries(projectData.standort_verteilung || {})
      .filter(([_, quantity]) => quantity > 0)
      .map(([location, quantity]) => `${escapeHtml(location)}: ${Number(quantity)}`)
      .join(', ');

    const emailPromises = notificationUsers.map(async (user) => {
      const userEmail = userEmailMap.get(user.user_id);
      if (!userEmail) return null;

      const emailData = {
        personalizations: [
          {
            to: [{ email: userEmail, name: escapeHtml(user.display_name) || userEmail }],
            subject: `Projekt ${safeProjectNumber} vom Ersteller abgesagt`,
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
                  <p><strong>Projektnummer:</strong> ${safeProjectNumber}</p>
                  <p><strong>Kunde:</strong> ${safeCustomer}</p>
                  <p><strong>Artikel:</strong> ${safeArtikelNummer} - ${safeArtikelBezeichnung}</p>
                  <p><strong>Gesamtmenge:</strong> ${safeGesamtmenge}</p>
                  ${projectData.erste_anlieferung ? `<p><strong>Erste Anlieferung:</strong> ${new Date(projectData.erste_anlieferung).toLocaleDateString('de-DE')}</p>` : ''}
                  ${projectData.letzte_anlieferung ? `<p><strong>Letzte Anlieferung:</strong> ${new Date(projectData.letzte_anlieferung).toLocaleDateString('de-DE')}</p>` : ''}
                  <p><strong>Standortverteilung:</strong> ${locationDistribution}</p>
                  ${safeBeschreibung ? `<p><strong>Beschreibung:</strong> ${safeBeschreibung}</p>` : ''}
                </div>
                <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                  <h3 style="margin-top: 0; color: #dc2626;">Absage-Information</h3>
                  <p><strong>Abgesagt von:</strong> ${safeRejectedByName} (Projektersteller)</p>
                  <p><strong>Ursprünglich erstellt von:</strong> ${safeCreatedByName}</p>
                  ${safeRejectionReason ? `<p><strong>Grund:</strong> ${safeRejectionReason}</p>` : ''}
                </div>
                <p>Dieses Projekt ist nun als "Abgelehnt" markiert.</p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                <p style="font-size: 12px; color: #6b7280;">Diese E-Mail wurde automatisch generiert.</p>
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
        console.error(`Failed to send email to ${userEmail}:`, response.status);
        return null;
      }

      return userEmail;
    });

    const results = await Promise.allSettled(emailPromises);
    const successfulEmails = results
      .filter((result): result is PromiseFulfilledResult<string | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);

    return new Response(JSON.stringify({ 
      message: 'Creator rejection emails sent',
      total: successfulEmails.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-creator-rejection-email function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

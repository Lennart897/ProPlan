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
    const webhookUrl = Deno.env.get('MAKE_PROJECT_WEBHOOK_URL')!;

    if (!supabaseUrl || !supabaseServiceKey || !webhookUrl) {
      console.error('Missing required environment variables');
      return new Response('Server configuration error', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const project: ProjectPayload = await req.json();
    console.log('Processing project approval notification:', project.project_number);

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get affected locations from standort_verteilung
    const affectedLocations: string[] = [];
    if (project.standort_verteilung) {
      for (const [location, quantity] of Object.entries(project.standort_verteilung)) {
        if (quantity > 0) {
          affectedLocations.push(location);
        }
      }
    }

    console.log('Affected locations:', affectedLocations);

    // Get planning users for affected locations
    const planningRoles = [
      'planung',
      ...affectedLocations.map(loc => `planung_${loc}`)
    ];

    const { data: planningUsers, error: usersError } = await supabase
      .from('profiles')
      .select('user_id, display_name, role')
      .in('role', planningRoles);

    if (usersError) {
      console.error('Error fetching planning users:', usersError);
      return new Response('Error fetching users', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('Found planning users:', planningUsers?.length || 0);

    // Get email addresses from auth.users
    const userIds = planningUsers?.map(user => user.user_id) || [];
    if (userIds.length === 0) {
      console.log('No planning users found for affected locations');
      return new Response('No recipients found', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return new Response('Error fetching user emails', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const recipientEmails = authUsers.users
      .filter(user => userIds.includes(user.id))
      .map(user => user.email)
      .filter(email => email);

    console.log('Recipient emails:', recipientEmails.length);

    if (recipientEmails.length === 0) {
      console.log('No valid email addresses found');
      return new Response('No valid recipients', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    // Helper functions
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
        .map(([location, quantity]) => {
          const locationLabels: Record<string, string> = {
            'mainz': 'Mainz',
            'berlin': 'Berlin', 
            'muenchen': 'München',
            'hamburg': 'Hamburg',
            'koeln': 'Köln',
            'stuttgart': 'Stuttgart'
          };
          const locationName = locationLabels[location] || location;
          return `<li><strong>${locationName}:</strong> ${formatQuantity(quantity)} Stück</li>`;
        })
        .join('');
    };

    // Create HTML email content for approval notification
    const htmlContent = `<h1>📋 ProPlan System – Projekt freigegeben</h1>
<p>Sehr geehrte Damen und Herren,</p>
<p>Ein Fertigungsprojekt wurde von der Supply Chain freigegeben und ist nun zur Bearbeitung bereit.</p>
<hr>
<h2>📊 Projektübersicht</h2>
<ul>
  <li><strong>Projekt-Nr.:</strong> #${project.project_number}</li>
  <li><strong>Kunde:</strong> ${project.customer}</li>
  <li><strong>Artikelnummer:</strong> ${project.artikel_nummer}</li>
  <li><strong>Artikelbezeichnung:</strong> ${project.artikel_bezeichnung}</li>
  <li><strong>Gesamtmenge:</strong> ${formatQuantity(project.gesamtmenge)} Stück</li>
  <li><strong>Erste Anlieferung:</strong> 📅 ${formatDate(project.erste_anlieferung)}</li>
  <li><strong>Letzte Anlieferung:</strong> 📅 ${formatDate(project.letzte_anlieferung)}</li>
  <li><strong>Erstellt von:</strong> ${project.created_by_name}</li>
</ul>
${project.beschreibung ? `<h2>📝 Beschreibung</h2><p>${project.beschreibung}</p>` : ''}
<h2>📍 Standortverteilung</h2>
<ul>
${formatLocationDistribution(project.standort_verteilung)}
</ul>
<hr>
<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 16px; margin: 16px 0;">
  <h2 style="margin-top: 0; color: #1976d2;">⚡ Status: Freigegeben</h2>
  <p style="margin-bottom: 0;"><strong>Das Projekt wurde von der Supply Chain genehmigt und kann nun von Ihnen bearbeitet werden.</strong></p>
</div>
<p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #2196f3; text-decoration: none;">Zum Projekt im ProPlan System</a></p>
<hr>
<p style="color: #666; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>
<p><strong>Mit freundlichen Grüßen,<br>ProPlan Benachrichtigungssystem</strong></p>`;

    // Prepare webhook payload
    const webhookPayload = {
      to: recipientEmails,
      subject: `✅ Projekt #${project.project_number} freigegeben - ${project.customer}`,
      content: htmlContent,
      contentType: 'HTML'
    };

    console.log('Sending webhook to:', webhookUrl);
    console.log('Recipients:', recipientEmails);

    // Send to webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Webhook error:', errorText);
      throw new Error(`Webhook failed: ${webhookResponse.status} ${errorText}`);
    }

    console.log('Project approval email sent successfully');
    return new Response('Email sent successfully', { 
      status: 200, 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Error in send-project-approval-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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
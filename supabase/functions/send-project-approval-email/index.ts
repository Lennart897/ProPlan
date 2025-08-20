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

    // Get the project creator (Vertrieb user) to notify them about approval
    if (!project.created_by_id) {
      console.log('No created_by_id found in project');
      return new Response('No project creator found', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    console.log('Project created by user ID:', project.created_by_id);

    // Get the creator's email from auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(project.created_by_id);
    
    if (authError) {
      console.error('Error fetching creator email:', authError);
      return new Response('Error fetching creator email', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    if (!authUser.user?.email) {
      console.log('No email found for project creator');
      return new Response('No email for creator', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    const recipientEmails = [authUser.user.email];
    console.log('Sending approval notification to project creator:', authUser.user.email);

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

    // Create HTML email content for approval notification to project creator
    const htmlContent = `<h1>🎉 ProPlan System – Ihr Projekt wurde genehmigt!</h1>
<p>Hallo ${project.created_by_name},</p>
<p>Ihr Fertigungsprojekt wurde erfolgreich von allen beteiligten Standorten genehmigt und ist nun vollständig freigegeben!</p>
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
<div style="background-color: #e8f5e8; border-left: 4px solid #4caf50; padding: 16px; margin: 16px 0;">
  <h2 style="margin-top: 0; color: #2e7d32;">✅ Status: Vollständig genehmigt</h2>
  <p style="margin-bottom: 0;"><strong>Alle beteiligten Standorte haben Ihr Projekt genehmigt. Die Produktion kann beginnen!</strong></p>
</div>
<p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #2196f3; text-decoration: none;">Zum Projekt im ProPlan System</a></p>
<hr>
<p style="color: #666; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>
<p><strong>Mit freundlichen Grüßen,<br>ProPlan Benachrichtigungssystem</strong></p>`;

    const toRecipients = recipientEmails.map(email => ({
      emailAddress: {
        address: email
      }
    }));

    // Prepare webhook payload in the same format as project creation
    const webhookPayload = {
      message: {
        subject: `🎉 ProPlan - Ihr Projekt wurde genehmigt #${project.project_number}: ${project.artikel_bezeichnung}`,
        body: {
          contentType: "HTML",
          content: htmlContent
        },
        toRecipients
      },
      metadata: {
        type: "project_approval",
        triggered_at: new Date().toISOString(),
        project_id: project.id,
        project_number: project.project_number,
        created_by_id: project.created_by_id,
        recipient_email: authUser.user.email,
        standort_verteilung: project.standort_verteilung
      }
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
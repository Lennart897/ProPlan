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

    // Get supply chain users (same schema as project creation)
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('user_id, role, display_name')
      .eq('role', 'supply_chain');

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: corsHeaders
      });
    }

    console.log('Supply chain profiles found:', profiles?.length || 0);
    console.log('Raw profiles:', profiles?.map(p => ({ user_id: p.user_id, display_name: p.display_name })));

    // Get unique user IDs from profiles
    const uniqueUserIds = Array.from(new Set((profiles || []).map((p: any) => p.user_id).filter(Boolean)));
    console.log('Unique supply chain user IDs:', uniqueUserIds.length);
    console.log('User IDs to fetch emails for:', uniqueUserIds);

    // Get all users to map emails
    const getAllUsers = async () => {
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;
      
      while (true) {
        const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          console.error('listUsers failed', listErr);
          throw new Error(listErr.message);
        }
        
        if (!list.users || list.users.length === 0) break;
        allUsers.push(...list.users);
        
        if (list.users.length < perPage) break;
        page++;
      }
      
      return allUsers;
    };

    let allUsers;
    try {
      allUsers = await getAllUsers();
    } catch (err: any) {
      console.error('Failed to load all users:', err);
      return new Response(JSON.stringify({ error: `Failed to load users: ${err.message}` }), {
        status: 500,
        headers: corsHeaders
      });
    }

    console.log('Total auth users loaded:', allUsers.length);

    // Create email mapping
    const emailById = new Map<string, string>();
    const authUserIds = new Set<string>();
    
    for (const u of allUsers) {
      if (u.id) {
        authUserIds.add(u.id);
        if (u.email) {
          emailById.set(u.id, u.email);
        }
      }
    }

    // Get emails for supply chain users
    const foundEmails: Array<{userId: string, email: string}> = [];
    for (const userId of uniqueUserIds) {
      if (authUserIds.has(userId)) {
        const email = emailById.get(userId);
        if (email) {
          foundEmails.push({ userId, email });
        }
      }
    }

    // Deduplicate emails
    const emailSet = new Set<string>();
    const recipientEmails: string[] = [];
    
    for (const { email } of foundEmails) {
      if (!emailSet.has(email)) {
        emailSet.add(email);
        recipientEmails.push(email);
      }
    }

    console.log('Final email processing summary:', {
      uniqueEmails: recipientEmails.length,
      duplicatesRemoved: foundEmails.length - recipientEmails.length,
      finalRecipientEmails: recipientEmails
    });

    if (recipientEmails.length === 0) {
      console.error('No valid recipients found for supply chain role');
      return new Response(JSON.stringify({ error: 'No valid recipients found for supply chain role' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // Format the current date
    const currentDate = new Date().toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Professional email content for rejection notification
    const professionalEmailContent = `<h1>❌ ProPlan System – Projekt abgesagt</h1><p>Sehr geehrte Damen und Herren,</p><p>ein Fertigungsprojekt wurde im ProPlan System von der SupplyChain-Abteilung abgesagt und benötigt Ihre Kenntnisnahme.</p><hr><h2>📋 Projektübersicht</h2><ul><li><strong>Projekt-Nr.:</strong> #${payload.project_number}</li><li><strong>🏢 Kunde:</strong> ${payload.customer}</li><li><strong>📦 Artikelnummer:</strong> ${payload.artikel_nummer}</li><li><strong>📋 Artikelbezeichnung:</strong> ${payload.artikel_bezeichnung}</li><li><strong>👤 Erstellt von:</strong> ${payload.created_by_name}</li><li><strong>📅 Absage am:</strong> ${currentDate}</li></ul>${payload.rejection_reason ? `<hr><h2>📝 Ablehnungsgrund</h2><p><strong>${payload.rejection_reason}</strong></p>` : ''}<hr><div style="border: 2px solid #d32f2f; border-radius: 8px; padding: 16px; background-color: #ffebee; margin: 20px 0;"><h3 style="color: #d32f2f; margin-top: 0;">⚠️ Status-Update</h3><p>Dieses Projekt wurde in den Status <strong>"Abgelehnt"</strong> verschoben und ist nicht weiter zu bearbeiten.</p><p>Der Projektersteller wurde automatisch über die Absage informiert.</p></div><p>🔗 <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" style="color: #007acc; text-decoration: underline;">Zum ProPlan System</a></p><hr><p style="color: #666; font-style: italic;">Mit freundlichen Grüßen<br>ProPlan Benachrichtigungssystem</p><p style="color: #999; font-size: 12px;"><em>Diese E-Mail wurde automatisch generiert.</em></p>`;

    // Send emails via SendGrid to supply chain users
    const emailPromises = recipientEmails.map(async (email) => {
      const emailBody = {
        personalizations: [
          {
            to: [{ email }],
            subject: `❌ ProPlan - Projekt #${payload.project_number} abgesagt: ${payload.customer}`
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
        console.error('SendGrid error:', emailResponse.status, errorText);
        throw new Error(`SendGrid API error: ${emailResponse.status}`);
      }

      console.log('Project rejection email sent successfully to:', email);
    });

    await Promise.all(emailPromises);

    console.log('Project rejection emails sent via SendGrid', { 
      id: payload.id, 
      emailsSent: recipientEmails.length, 
      recipients: recipientEmails 
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Project rejection notification sent successfully',
        recipients: recipientEmails,
        emailsSent: recipientEmails.length
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
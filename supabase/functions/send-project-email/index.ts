import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProjectPayload {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge?: number | null;
  erste_anlieferung?: string | null; // ISO date
  letzte_anlieferung?: string | null; // ISO date
  beschreibung?: string | null;
  standort_verteilung?: Record<string, any> | null;
  created_by_id: string;
  created_by_name: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
    const webhookUrl = Deno.env.get("MAKE_PROJECT_WEBHOOK_URL");

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    if (!webhookUrl) throw new Error("Missing MAKE_PROJECT_WEBHOOK_URL secret");

    const body = (await req.json()) as ProjectPayload;
    const {
      id,
      project_number,
      customer,
      artikel_nummer,
      artikel_bezeichnung,
      gesamtmenge,
      erste_anlieferung,
      letzte_anlieferung,
      beschreibung,
      standort_verteilung,
      created_by_id,
      created_by_name,
    } = body;

    console.log("send-project-email payload", { id, project_number, customer, artikel_bezeichnung });

    // Admin client to fetch potential recipients (supply_chain role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('user_id, role, display_name')
      .eq('role', 'supply_chain');

    if (profErr) {
      console.error('profiles query failed', profErr);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supplyUserIds = (profiles || []).map((p: any) => p.user_id);

    // Map user_id -> email using auth admin list
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      console.error('listUsers failed', listErr);
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailById = new Map<string, string>();
    for (const u of list.users || []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }

    const recipientEmails = Array.from(new Set(supplyUserIds
      .map((uid: string) => emailById.get(uid))
      .filter(Boolean))) as string[];

    const toRecipients = recipientEmails.map(email => ({
      emailAddress: {
        address: email
      }
    }));

    console.log('Resolved recipients for supply_chain', { count: toRecipients.length });

    // Helper functions for professional formatting
    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Nicht angegeben';
      return new Date(dateStr).toLocaleDateString('de-DE');
    };

    const formatQuantity = (quantity: number | null) => {
      if (!quantity) return 'Nicht angegeben';
      return new Intl.NumberFormat('de-DE').format(quantity) + ' kg';
    };

    const formatLocationDistribution = (distribution: Record<string, any> | null) => {
      if (!distribution) return 'Keine Verteilung angegeben';
      return Object.entries(distribution)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([location, qty]) => `${location.charAt(0).toUpperCase() + location.slice(1)}: ${formatQuantity(Number(qty))}`)
        .join('<br>');
    };

    // Professional email content in German
    const professionalEmailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">ProPlan System</h1>
          <p style="color: #6c757d; margin: 10px 0 0 0; font-size: 16px;">Neues Projekt zur Überprüfung</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border: 1px solid #e9ecef; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #495057; border-bottom: 3px solid #007bff; padding-bottom: 15px; margin-bottom: 25px; font-size: 22px;">
            Projekt #${project_number}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8f9fa; border-radius: 5px;">
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; width: 35%; border-bottom: 1px solid #dee2e6;">Kunde:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${customer}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;">Artikelnummer:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${artikel_nummer}</td>
            </tr>
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;">Artikelbezeichnung:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6; font-weight: 500;">${artikel_bezeichnung}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;">Gesamtmenge:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${formatQuantity(gesamtmenge)}</td>
            </tr>
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;">Erste Anlieferung:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${formatDate(erste_anlieferung)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;">Letzte Anlieferung:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${formatDate(letzte_anlieferung)}</td>
            </tr>
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; vertical-align: top; border-bottom: 1px solid #dee2e6;">Standortverteilung:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${formatLocationDistribution(standort_verteilung)}</td>
            </tr>
            ${beschreibung ? `
            <tr>
              <td style="padding: 12px 15px; font-weight: bold; color: #495057; vertical-align: top; border-bottom: 1px solid #dee2e6;">Beschreibung:</td>
              <td style="padding: 12px 15px; color: #6c757d; border-bottom: 1px solid #dee2e6;">${beschreibung}</td>
            </tr>
            ` : ''}
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px 15px; font-weight: bold; color: #495057;">Erstellt von:</td>
              <td style="padding: 12px 15px; color: #6c757d;">${created_by_name}</td>
            </tr>
          </table>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #2196f3;">
            <h3 style="margin: 0 0 10px 0; color: #1565c0; font-size: 18px;">📋 Handlungserfordernis</h3>
            <p style="margin: 0; color: #1565c0; font-size: 16px; line-height: 1.5;">
              Dieses Projekt wartet auf Ihre Überprüfung und Genehmigung im Supply Chain System. 
              Bitte prüfen Sie die Angaben und nehmen Sie die entsprechende Bearbeitung vor.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://lovable.dev/projects/ea0f2a9b-f59f-4af0-aaa1-f3b0bffaf89e" 
               style="background-color: #007bff; color: white; padding: 15px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,123,255,0.3); transition: background-color 0.3s;">
              🔗 Projekt im System öffnen
            </a>
          </div>
        </div>
        
        <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; font-size: 14px; color: #6c757d; text-align: center; border-top: 3px solid #28a745;">
          <p style="margin: 0 0 5px 0; font-weight: 500;">ProPlan Benachrichtigungssystem</p>
          <p style="margin: 0; line-height: 1.4;">
            Diese E-Mail wurde automatisch generiert.<br>
            Bei Rückfragen wenden Sie sich bitte an: <strong>${created_by_name}</strong>
          </p>
        </div>
      </div>
    `;

    // Forward to Make as Graph-compatible message format
    const payload = {
      message: {
        subject: `ProPlan - Neues Projekt #${project_number}: ${artikel_bezeichnung}`,
        body: {
          contentType: "HTML",
          content: professionalEmailContent
        },
        toRecipients
      },
      metadata: {
        type: "project",
        triggered_at: new Date().toISOString(),
        project_id: id,
        project_number,
        created_by_id,
        standort_verteilung
      }
    };

    console.log("Forwarding project to Make", { id, recipients: toRecipients.length });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Make webhook failed", res.status, txt);
      throw new Error(`Make webhook error: ${res.status}`);
    }

    console.log("Project dispatched to Make", { id, status: res.status });

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-project-email error", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-complete projects job...');

    // Get current date in YYYY-MM-DD format
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    console.log('Current date:', todayString);

    // Find all projects with status 5 (GENEHMIGT) where letzte_anlieferung + 1 day <= today
    const { data: projectsToComplete, error: fetchError } = await supabase
      .from('manufacturing_projects')
      .select('id, project_number, letzte_anlieferung, customer')
      .eq('status', 5) // GENEHMIGT
      .not('letzte_anlieferung', 'is', null)
      .lt('letzte_anlieferung', todayString); // letzte_anlieferung < today (meaning it's past due)

    if (fetchError) {
      console.error('Error fetching projects:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${projectsToComplete?.length || 0} projects to auto-complete`);

    if (!projectsToComplete || projectsToComplete.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No projects to auto-complete',
          completedCount: 0 
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Update all eligible projects to status 7 (ABGESCHLOSSEN)
    const projectIds = projectsToComplete.map(p => p.id);
    
    const { error: updateError } = await supabase
      .from('manufacturing_projects')
      .update({ 
        status: 7, // ABGESCHLOSSEN
        updated_at: new Date().toISOString()
      })
      .in('id', projectIds);

    if (updateError) {
      console.error('Error updating projects:', updateError);
      throw updateError;
    }

    // Log the completed projects
    for (const project of projectsToComplete) {
      console.log(`Auto-completed project ${project.project_number} (${project.customer}) - Last delivery: ${project.letzte_anlieferung}`);
      
      // Insert project history record
      await supabase
        .from('project_history')
        .insert({
          project_id: project.id,
          user_id: '00000000-0000-0000-0000-000000000000', // System user ID
          user_name: 'System',
          action: 'Projekt automatisch abgeschlossen',
          previous_status: 'Genehmigt',
          new_status: 'Abgeschlossen',
          reason: `Automatisch abgeschlossen da letztes Anlieferdatum (${project.letzte_anlieferung}) überschritten wurde`
        });
    }

    const response = {
      success: true,
      message: `Successfully auto-completed ${projectsToComplete.length} projects`,
      completedCount: projectsToComplete.length,
      completedProjects: projectsToComplete.map(p => ({
        projectNumber: p.project_number,
        customer: p.customer,
        lastDelivery: p.letzte_anlieferung
      }))
    };

    console.log('Auto-complete job finished successfully:', response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('Error in auto-complete-projects function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
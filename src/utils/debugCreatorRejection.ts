// Creator Rejection Debug Utility
// This utility helps test and debug creator rejection functionality
// Use in browser console or integrate into development tools

import { supabase } from "@/integrations/supabase/client";
import { PROJECT_STATUS } from "@/utils/statusUtils";

export interface CreatorRejectionDebugResult {
  canShowButton: boolean;
  canExecuteAction: boolean;
  relsPermissions: any;
  errors: string[];
  recommendations: string[];
}

/**
 * Debug creator rejection functionality for a specific project and user
 * @param projectId - The ID of the project to test
 * @param userId - The ID of the user (optional, uses current authenticated user if not provided)
 */
export async function debugCreatorRejection(
  projectId: string, 
  userId?: string
): Promise<CreatorRejectionDebugResult> {
  const result: CreatorRejectionDebugResult = {
    canShowButton: false,
    canExecuteAction: false,
    relsPermissions: null,
    errors: [],
    recommendations: []
  };

  try {
    // Get current user if not provided
    const currentUser = userId || (await supabase.auth.getUser()).data.user?.id;
    if (!currentUser) {
      result.errors.push("No authenticated user found");
      return result;
    }

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('manufacturing_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      result.errors.push(`Failed to fetch project: ${projectError?.message || 'Project not found'}`);
      return result;
    }

    // Check frontend conditions
    const isProjectApproved = project.status === PROJECT_STATUS.GENEHMIGT;
    const isUserCreator = (project.created_by_id === currentUser) || (project.created_by === currentUser);
    result.canShowButton = isProjectApproved && isUserCreator;

    // Check database permissions using debug function
    try {
      const { data: debugData, error: debugError } = await supabase
        .rpc('debug_creator_permission', { project_id: projectId });
      
      if (debugError) {
        result.errors.push(`RLS debug failed: ${debugError.message}`);
      } else {
        result.relsPermissions = debugData;
      }
    } catch (debugErr) {
      result.errors.push(`Debug function error: ${debugErr}`);
    }

    // Test actual update permission (dry run)
    try {
      const { error: updateError } = await supabase
        .from('manufacturing_projects')
        .update({ status: PROJECT_STATUS.ABGELEHNT })
        .eq('id', projectId)
        .eq('created_by_id', currentUser); // This should only match if user is creator

      if (!updateError) {
        result.canExecuteAction = true;
        // Rollback the change
        await supabase
          .from('manufacturing_projects')
          .update({ status: project.status })
          .eq('id', projectId);
      } else {
        result.errors.push(`Update permission denied: ${updateError.message}`);
      }
    } catch (updateErr) {
      result.errors.push(`Update test failed: ${updateErr}`);
    }

    // Generate recommendations
    if (!isProjectApproved) {
      result.recommendations.push(`Project status is ${project.status}, needs to be ${PROJECT_STATUS.GENEHMIGT} (approved) for creator rejection`);
    }
    if (!isUserCreator) {
      result.recommendations.push(`User ${currentUser} is not the creator of project (creator: ${project.created_by_id || project.created_by})`);
    }
    if (result.canShowButton && !result.canExecuteAction) {
      result.recommendations.push("Button should show but action will fail - check RLS policies");
    }
    if (!result.canShowButton && result.canExecuteAction) {
      result.recommendations.push("Action would work but button won't show - check frontend logic");
    }

    console.log('=== CREATOR REJECTION DEBUG RESULTS ===');
    console.log('Project ID:', projectId);
    console.log('User ID:', currentUser);
    console.log('Project Status:', project.status);
    console.log('Project Creator (by_id):', project.created_by_id);
    console.log('Project Creator (legacy):', project.created_by);
    console.log('Can Show Button:', result.canShowButton);
    console.log('Can Execute Action:', result.canExecuteAction);
    console.log('RLS Permissions:', result.relsPermissions);
    console.log('Errors:', result.errors);
    console.log('Recommendations:', result.recommendations);

  } catch (error) {
    result.errors.push(`Debug function error: ${error}`);
  }

  return result;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).debugCreatorRejection = debugCreatorRejection;
}
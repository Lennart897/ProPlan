import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Location {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationOption {
  value: string;
  label: string;
}

/**
 * Hook to fetch and manage locations
 * @param activeOnly - If true, only returns active locations
 * @param userLocationOnly - If true and user has location-specific role, only returns user's location
 */
export function useLocations(activeOnly: boolean = true, userLocationOnly: boolean = false) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // First get user's location if userLocationOnly is true
      let userLocationCode: string | null = null;
      if (userLocationOnly) {
        const { data: user } = await supabase.auth.getUser();
        if (user.user) {
          const { data: userLocationData, error: userLocationError } = await supabase
            .rpc('get_user_location_code', { user_uuid: user.user.id });
          
          if (userLocationError) {
            console.error('Error getting user location:', userLocationError);
          } else {
            userLocationCode = userLocationData;
          }
        }
      }

      let query = supabase.from('locations').select('*');

      // Filter by active status if requested
      if (activeOnly) {
        query = query.eq('active', true);
      }

      // Filter by user's location if applicable
      if (userLocationCode) {
        query = query.eq('code', userLocationCode);
      }

      const { data, error } = await query.order('name');

      if (error) {
        throw error;
      }

      const locationsData = data || [];
      setLocations(locationsData);

      // Convert to options format for select components
      const options = locationsData.map((location) => ({
        value: location.code,
        label: location.name,
      }));
      setLocationOptions(options);

    } catch (err) {
      console.error('Error loading locations:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: "Standorte konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get location name by code
  const getLocationName = (code: string): string => {
    const location = locations.find(loc => loc.code === code);
    return location?.name || code;
  };

  // Get location by code
  const getLocationByCode = (code: string): Location | undefined => {
    return locations.find(loc => loc.code === code);
  };

  // Convert legacy location labels to new format
  const convertLocationLabels = (locationData: Record<string, number>): Record<string, number> => {
    const convertedData: Record<string, number> = {};
    
    // Legacy mapping for backwards compatibility
    const legacyMapping: Record<string, string> = {
      'Gudensberg': 'gudensberg',
      'Brenz': 'brenz', 
      'Storkow': 'storkow',
      'Visbek': 'visbek',
      'Döbeln': 'doebeln',
    };

    Object.entries(locationData).forEach(([key, value]) => {
      // Check if key is already a code
      const existingLocation = locations.find(loc => loc.code === key);
      if (existingLocation) {
        convertedData[key] = value;
      } else {
        // Try to convert from legacy label
        const code = legacyMapping[key] || key.toLowerCase();
        convertedData[code] = value;
      }
    });

    return convertedData;
  };

  useEffect(() => {
    loadLocations();
  }, [activeOnly, userLocationOnly]);

  return {
    locations,
    locationOptions,
    isLoading,
    error,
    reload: loadLocations,
    getLocationName,
    getLocationByCode,
    convertLocationLabels,
  };
}
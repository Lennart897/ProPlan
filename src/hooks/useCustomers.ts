import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Customer {
  id: string;
  customer_number: string;
  name: string;
  representative_id?: string;
  representative_name?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerOption {
  value: string;
  label: string;
  customer_number: string;
}

export function useCustomers(activeOnly: boolean = true) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCustomers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase.from('customers').select('*');

      if (activeOnly) {
        query = query.eq('active', true);
      }

      const { data, error } = await query.order('name');

      if (error) {
        throw error;
      }

      const customersData = data || [];
      setCustomers(customersData);

      const options = customersData.map((customer) => ({
        value: customer.id,
        label: `${customer.name} (${customer.customer_number})`,
        customer_number: customer.customer_number,
      }));
      setCustomerOptions(options);

    } catch (err) {
      console.error('Error loading customers:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: "Kunden konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createCustomer = async (customerData: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Kunde wurde erfolgreich erstellt.",
      });

      await loadCustomers();
      return data;
    } catch (err) {
      console.error('Error creating customer:', err);
      toast({
        title: "Fehler",
        description: "Kunde konnte nicht erstellt werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateCustomer = async (id: string, customerData: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Kunde wurde erfolgreich aktualisiert.",
      });

      await loadCustomers();
      return data;
    } catch (err) {
      console.error('Error updating customer:', err);
      toast({
        title: "Fehler",
        description: "Kunde konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Kunde wurde erfolgreich gelöscht.",
      });

      await loadCustomers();
    } catch (err) {
      console.error('Error deleting customer:', err);
      toast({
        title: "Fehler",
        description: "Kunde konnte nicht gelöscht werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const getCustomerById = (id: string): Customer | undefined => {
    return customers.find(customer => customer.id === id);
  };

  useEffect(() => {
    loadCustomers();
  }, [activeOnly]);

  return {
    customers,
    customerOptions,
    isLoading,
    error,
    reload: loadCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerById,
  };
}
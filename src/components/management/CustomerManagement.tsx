import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useCustomers, Customer } from '@/hooks/useCustomers';
import { Plus, Edit, User } from 'lucide-react';
import { useForm } from 'react-hook-form';

type CustomerFormData = Omit<Customer, 'id' | 'created_at' | 'updated_at'>;

export function CustomerManagement() {
  const { customers, isLoading, createCustomer, updateCustomer } = useCustomers(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const form = useForm<CustomerFormData>({
    defaultValues: {
      customer_number: '',
      name: '',
      representative_name: '',
      active: true,
    }
  });

  const onSubmit = async (data: CustomerFormData) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data);
      } else {
        await createCustomer(data);
      }
      setIsDialogOpen(false);
      setEditingCustomer(null);
      form.reset();
    } catch (error) {
      console.error('Error saving customer:', error);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    form.reset(customer);
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCustomer(null);
    form.reset({
      customer_number: '',
      name: '',
      representative_name: '',
      active: true,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div>Lade Kunden...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Kundenverwaltung</h1>
          <p className="text-muted-foreground">Verwalten Sie hier alle Kunden und deren Daten</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Neuer Kunde
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {editingCustomer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer_number">Kundennummer</Label>
                  <Input
                    id="customer_number"
                    {...form.register('customer_number', { required: true })}
                    placeholder="K-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Kundenname</Label>
                  <Input
                    id="name"
                    {...form.register('name', { required: true })}
                    placeholder="Musterfirma GmbH"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="representative_name">Vertreter</Label>
                <Input
                  id="representative_name"
                  {...form.register('representative_name')}
                  placeholder="Max Mustermann"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={form.watch('active')}
                  onCheckedChange={(checked) => form.setValue('active', checked)}
                />
                <Label htmlFor="active">Aktiv</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button type="submit">
                  {editingCustomer ? 'Aktualisieren' : 'Erstellen'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alle Kunden ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kundennummer</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Vertreter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.customer_number}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.representative_name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={customer.active ? 'default' : 'secondary'}>
                      {customer.active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(customer.created_at).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(customer)}
                      className="flex items-center gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Bearbeiten
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
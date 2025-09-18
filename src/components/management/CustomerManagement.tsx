import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useCustomers, Customer } from '@/hooks/useCustomers';
import { Plus, Edit, User, Building2, UserCheck, Calendar, ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Lade Kunden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Back Button */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Dashboard
          </Button>
        </Link>
      </div>
      
      {/* Header Section */}
      {/* Header Section */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-6 border">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Kundenverwaltung</h1>
                <p className="text-muted-foreground">Verwalten Sie hier alle Kunden und deren Daten</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4">
              <div className="flex items-center gap-1">
                <UserCheck className="h-4 w-4" />
                <span>{customers.filter(c => c.active).length} aktive Kunden</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{customers.length} gesamt</span>
              </div>
            </div>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="flex items-center gap-2 shadow-md">
                <Plus className="h-4 w-4" />
                Neuer Kunde
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  {editingCustomer ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
                </DialogTitle>
                <DialogDescription>
                  {editingCustomer 
                    ? 'Bearbeiten Sie die Kundendaten nach Ihren Anforderungen.'
                    : 'Erfassen Sie hier die grundlegenden Informationen für den neuen Kunden.'
                  }
                </DialogDescription>
              </DialogHeader>
              
              <Separator />
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Grunddaten Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    Grunddaten
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_number" className="text-sm font-medium">
                        Kundennummer <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="customer_number"
                        {...form.register('customer_number', { required: true })}
                        placeholder="z.B. K-12345"
                        className="h-11"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">
                        Firmenname <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        {...form.register('name', { required: true })}
                        placeholder="z.B. Musterfirma GmbH"
                        className="h-11"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Ansprechpartner Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <UserCheck className="h-4 w-4" />
                    Ansprechpartner
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="representative_name" className="text-sm font-medium">
                      Vertreter
                    </Label>
                    <Input
                      id="representative_name"
                      {...form.register('representative_name')}
                      placeholder="z.B. Max Mustermann"
                      className="h-11"
                    />
                  </div>
                </div>

                <Separator />

                {/* Status Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Status
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-1">
                      <Label htmlFor="active" className="text-sm font-medium">
                        Kunde aktiv
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Aktive Kunden werden in den Auswahlmenüs angezeigt
                      </p>
                    </div>
                    <Switch
                      id="active"
                      checked={form.watch('active')}
                      onCheckedChange={(checked) => form.setValue('active', checked)}
                    />
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="min-w-[100px]"
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" className="min-w-[120px]">
                    {editingCustomer ? 'Aktualisieren' : 'Erstellen'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Customer Table */}
      <Card className="shadow-md">
        <CardHeader className="bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Alle Kunden ({customers.length})
            </CardTitle>
            {customers.length === 0 && (
              <Badge variant="outline" className="text-xs">
                Keine Kunden vorhanden
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-muted/30 rounded-full mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Noch keine Kunden angelegt</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Legen Sie Ihren ersten Kunden an, um mit der Verwaltung zu beginnen.
              </p>
              <Button onClick={handleNew} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Ersten Kunden anlegen
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="font-semibold">Kundennummer</TableHead>
                    <TableHead className="font-semibold">Firmenname</TableHead>
                    <TableHead className="font-semibold">Vertreter</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Erstellt</TableHead>
                    <TableHead className="font-semibold text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-sm font-medium">
                        {customer.customer_number}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {customer.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.representative_name ? (
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-muted-foreground" />
                            {customer.representative_name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Kein Vertreter</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={customer.active ? 'default' : 'secondary'}
                          className="font-medium"
                        >
                          {customer.active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(customer.created_at).toLocaleDateString('de-DE')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(customer)}
                          className="flex items-center gap-2 hover:bg-primary/10"
                        >
                          <Edit className="h-3 w-3" />
                          Bearbeiten
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
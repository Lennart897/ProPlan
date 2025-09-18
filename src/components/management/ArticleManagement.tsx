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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useArticles, Article } from '@/hooks/useArticles';
import { Plus, Edit, Package, Package2, Scale, Tag, ArrowLeft, Calendar, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

// Product groups - Chicken raw materials for Product Group 1
const PRODUCT_GROUPS = [
  "Hähnchenbrust",
  "Hähnchenschenkel", 
  "Hähnchen-Flügel",
  "Hähnchen-Keule",
  "Hähnchen-Innereien",
  "Hähnchen-Haut",
  "Hähnchen-Knochen",
  "Hähnchen-Hals"
] as const;

const PRODUCT_GROUPS_2 = [
  "Teilstück",
  "mit Rst", 
  "geschnitten",
  "mariniert"
] as const;

const SALES_UNITS = [
  "Kilogramm",
  "Stück",
  "Karton",
  "Kiste"
] as const;

type ArticleFormData = Omit<Article, 'id' | 'created_at' | 'updated_at'>;

export function ArticleManagement() {
  const { articles, isLoading, createArticle, updateArticle } = useArticles(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  
  const form = useForm<ArticleFormData>({
    defaultValues: {
      artikel_nummer: '',
      artikel_bezeichnung: '',
      produktgruppe: '',
      produktgruppe_2: '',
      verkaufseinheit: '',
      grammatur_verkaufseinheit: undefined,
      active: true,
    }
  });

  const onSubmit = async (data: ArticleFormData) => {
    try {
      if (editingArticle) {
        await updateArticle(editingArticle.id, data);
      } else {
        await createArticle(data);
      }
      setIsDialogOpen(false);
      setEditingArticle(null);
      form.reset();
    } catch (error) {
      console.error('Error saving article:', error);
    }
  };

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    form.reset(article);
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingArticle(null);
    form.reset({
      artikel_nummer: '',
      artikel_bezeichnung: '',
      produktgruppe: '',
      produktgruppe_2: '',
      verkaufseinheit: '',
      grammatur_verkaufseinheit: undefined,
      active: true,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Lade Artikel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Back Button */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Dashboard
          </Button>
        </Link>
      </div>
      
      {/* Header Section */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-6 border">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Artikelverwaltung</h1>
                <p className="text-muted-foreground">Verwalten Sie hier alle Artikel und deren Eigenschaften</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                <span>{articles.filter(a => a.active).length} aktive Artikel</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{articles.length} gesamt</span>
              </div>
            </div>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="flex items-center gap-2 shadow-md">
                <Plus className="h-4 w-4" />
                Neuer Artikel
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px]">
              <DialogHeader className="space-y-3">
                <DialogTitle className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  {editingArticle ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}
                </DialogTitle>
                <DialogDescription>
                  {editingArticle 
                    ? 'Bearbeiten Sie die Artikeldaten nach Ihren Anforderungen.'
                    : 'Erfassen Sie hier die grundlegenden Informationen für den neuen Artikel.'
                  }
                </DialogDescription>
              </DialogHeader>
              
              <Separator />
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Grunddaten Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Grunddaten
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="artikel_nummer" className="text-sm font-medium">
                        Artikelnummer <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="artikel_nummer"
                        {...form.register('artikel_nummer', { required: true })}
                        placeholder="z.B. ART-12345"
                        className="h-11"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="artikel_bezeichnung" className="text-sm font-medium">
                        Artikelbezeichnung <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="artikel_bezeichnung"
                        {...form.register('artikel_bezeichnung', { required: true })}
                        placeholder="z.B. Wellpappschachtel 300x200x100"
                        className="h-11"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Produktgruppen Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Package2 className="h-4 w-4" />
                    Produktkategorien
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="produktgruppe" className="text-sm font-medium">
                        Produktgruppe 1
                      </Label>
                      <Select
                        value={form.watch('produktgruppe') || ''}
                        onValueChange={(value) => form.setValue('produktgruppe', value)}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Produktgruppe auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRODUCT_GROUPS.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="produktgruppe_2" className="text-sm font-medium">
                        Produktgruppe 2
                      </Label>
                      <Select
                        value={form.watch('produktgruppe_2') || ''}
                        onValueChange={(value) => form.setValue('produktgruppe_2', value)}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Produktgruppe 2 auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRODUCT_GROUPS_2.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Technische Daten Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Scale className="h-4 w-4" />
                    Technische Daten
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="verkaufseinheit" className="text-sm font-medium">
                        Verkaufseinheit
                      </Label>
                      <Select
                        value={form.watch('verkaufseinheit') || ''}
                        onValueChange={(value) => form.setValue('verkaufseinheit', value)}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Verkaufseinheit auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {SALES_UNITS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="grammatur_verkaufseinheit" className="text-sm font-medium">
                        Grammatur Verkaufseinheit (kg)
                      </Label>
                      <Input
                        id="grammatur_verkaufseinheit"
                        type="number"
                        step="0.001"
                        {...form.register('grammatur_verkaufseinheit', { valueAsNumber: true })}
                        placeholder="z.B. 1,200"
                        className="h-11"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Status Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    Status
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-1">
                      <Label htmlFor="active" className="text-sm font-medium">
                        Artikel aktiv
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Aktive Artikel werden in den Auswahlmenüs angezeigt
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
                    {editingArticle ? 'Aktualisieren' : 'Erstellen'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Article Table */}
      <Card className="shadow-md">
        <CardHeader className="bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Alle Artikel ({articles.length})
            </CardTitle>
            {articles.length === 0 && (
              <Badge variant="outline" className="text-xs">
                Keine Artikel vorhanden
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-muted/30 rounded-full mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Noch keine Artikel angelegt</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Legen Sie Ihren ersten Artikel an, um mit der Verwaltung zu beginnen.
              </p>
              <Button onClick={handleNew} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Ersten Artikel anlegen
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="font-semibold">Artikelnummer</TableHead>
                    <TableHead className="font-semibold">Bezeichnung</TableHead>
                    <TableHead className="font-semibold">Produktgruppe 1</TableHead>
                    <TableHead className="font-semibold">Produktgruppe 2</TableHead>
                    <TableHead className="font-semibold">Verkaufseinheit</TableHead>
                    <TableHead className="font-semibold">Grammatur</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow key={article.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-sm font-medium">
                        {article.artikel_nummer}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {article.artikel_bezeichnung}
                        </div>
                      </TableCell>
                      <TableCell>
                        {article.produktgruppe ? (
                          <div className="flex items-center gap-2">
                            <Package2 className="h-4 w-4 text-muted-foreground" />
                            {article.produktgruppe}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Nicht angegeben</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {article.produktgruppe_2 ? (
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            {article.produktgruppe_2}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Nicht angegeben</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {article.verkaufseinheit ? (
                          <div className="flex items-center gap-2">
                            <Scale className="h-4 w-4 text-muted-foreground" />
                            {article.verkaufseinheit}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Nicht angegeben</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {article.grammatur_verkaufseinheit ? article.grammatur_verkaufseinheit.toFixed(3) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={article.active ? 'default' : 'secondary'}
                          className="font-medium"
                        >
                          {article.active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(article)}
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
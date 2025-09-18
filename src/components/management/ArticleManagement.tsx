import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useArticles, Article } from '@/hooks/useArticles';
import { Plus, Edit, Package } from 'lucide-react';
import { useForm } from 'react-hook-form';

// Product groups from the original ProjectForm
const PRODUCT_GROUPS = [
  "Wellpappe 1-wellig",
  "Wellpappe 2-wellig", 
  "Wellpappe 3-wellig",
  "Vollpappe",
  "Graupappe",
  "Sonderkarton"
] as const;

const PRODUCT_GROUPS_2 = [
  "Verpackung",
  "Display", 
  "Zuschnitt",
  "Stanzteile",
  "Sonderprodukt"
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
    return <div>Lade Artikel...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Artikelverwaltung</h1>
          <p className="text-muted-foreground">Verwalten Sie hier alle Artikel und deren Eigenschaften</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Neuer Artikel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {editingArticle ? 'Artikel bearbeiten' : 'Neuer Artikel'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="artikel_nummer">Artikelnummer</Label>
                  <Input
                    id="artikel_nummer"
                    {...form.register('artikel_nummer', { required: true })}
                    placeholder="ART-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artikel_bezeichnung">Artikelbezeichnung</Label>
                  <Input
                    id="artikel_bezeichnung"
                    {...form.register('artikel_bezeichnung', { required: true })}
                    placeholder="Wellpappschachtel 300x200x100"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="produktgruppe">Produktgruppe 1</Label>
                  <Select
                    value={form.watch('produktgruppe') || ''}
                    onValueChange={(value) => form.setValue('produktgruppe', value)}
                  >
                    <SelectTrigger>
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
                  <Label htmlFor="produktgruppe_2">Produktgruppe 2</Label>
                  <Select
                    value={form.watch('produktgruppe_2') || ''}
                    onValueChange={(value) => form.setValue('produktgruppe_2', value)}
                  >
                    <SelectTrigger>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="verkaufseinheit">Verkaufseinheit</Label>
                  <Input
                    id="verkaufseinheit"
                    {...form.register('verkaufseinheit')}
                    placeholder="Stück, m², m, kg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grammatur_verkaufseinheit">Grammatur Verkaufseinheit</Label>
                  <Input
                    id="grammatur_verkaufseinheit"
                    type="number"
                    step="0.01"
                    {...form.register('grammatur_verkaufseinheit', { valueAsNumber: true })}
                    placeholder="120.5"
                  />
                </div>
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
                  {editingArticle ? 'Aktualisieren' : 'Erstellen'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alle Artikel ({articles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikelnummer</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Produktgruppe 1</TableHead>
                <TableHead>Produktgruppe 2</TableHead>
                <TableHead>Verkaufseinheit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="font-medium">{article.artikel_nummer}</TableCell>
                  <TableCell>{article.artikel_bezeichnung}</TableCell>
                  <TableCell>{article.produktgruppe || '-'}</TableCell>
                  <TableCell>{article.produktgruppe_2 || '-'}</TableCell>
                  <TableCell>{article.verkaufseinheit || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={article.active ? 'default' : 'secondary'}>
                      {article.active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(article)}
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
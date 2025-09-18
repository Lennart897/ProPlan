import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Article {
  id: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  produktgruppe_2?: string;
  verkaufseinheit?: string;
  grammatur_verkaufseinheit?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArticleOption {
  value: string;
  label: string;
  artikel_nummer: string;
}

export function useArticles(activeOnly: boolean = true) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleOptions, setArticleOptions] = useState<ArticleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadArticles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase.from('articles').select('*');

      if (activeOnly) {
        query = query.eq('active', true);
      }

      const { data, error } = await query.order('artikel_bezeichnung');

      if (error) {
        throw error;
      }

      const articlesData = data || [];
      setArticles(articlesData);

      const options = articlesData.map((article) => ({
        value: article.id,
        label: `${article.artikel_bezeichnung} (${article.artikel_nummer})`,
        artikel_nummer: article.artikel_nummer,
      }));
      setArticleOptions(options);

    } catch (err) {
      console.error('Error loading articles:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: "Artikel konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createArticle = async (articleData: Omit<Article, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .insert([articleData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Artikel wurde erfolgreich erstellt.",
      });

      await loadArticles();
      return data;
    } catch (err) {
      console.error('Error creating article:', err);
      toast({
        title: "Fehler",
        description: "Artikel konnte nicht erstellt werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateArticle = async (id: string, articleData: Partial<Omit<Article, 'id' | 'created_at' | 'updated_at'>>) => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .update(articleData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Artikel wurde erfolgreich aktualisiert.",
      });

      await loadArticles();
      return data;
    } catch (err) {
      console.error('Error updating article:', err);
      toast({
        title: "Fehler",
        description: "Artikel konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteArticle = async (id: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Artikel wurde erfolgreich gelöscht.",
      });

      await loadArticles();
    } catch (err) {
      console.error('Error deleting article:', err);
      toast({
        title: "Fehler",
        description: "Artikel konnte nicht gelöscht werden.",
        variant: "destructive",
      });
      throw err;
    }
  };

  const getArticleById = (id: string): Article | undefined => {
    return articles.find(article => article.id === id);
  };

  useEffect(() => {
    loadArticles();
  }, [activeOnly]);

  return {
    articles,
    articleOptions,
    isLoading,
    error,
    reload: loadArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    getArticleById,
  };
}
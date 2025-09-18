import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useArticles } from "@/hooks/useArticles";

interface ArticleSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ArticleSelector({ 
  value, 
  onValueChange, 
  placeholder = "Artikel auswählen", 
  disabled = false,
  className 
}: ArticleSelectorProps) {
  const { articleOptions, isLoading } = useArticles(true);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Lade Artikel..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {articleOptions.map((article) => (
          <SelectItem key={article.value} value={article.value}>
            {article.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers } from "@/hooks/useCustomers";

interface CustomerSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomerSelector({ 
  value, 
  onValueChange, 
  placeholder = "Kunde auswählen", 
  disabled = false,
  className 
}: CustomerSelectorProps) {
  const { customerOptions, isLoading } = useCustomers(true);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Lade Kunden..." />
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
        {customerOptions.map((customer) => (
          <SelectItem key={customer.value} value={customer.value}>
            {customer.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
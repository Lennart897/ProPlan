import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/hooks/useLocations";

interface LocationSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  userLocationOnly?: boolean;
  disabled?: boolean;
  className?: string;
}

export function LocationSelector({ 
  value, 
  onValueChange, 
  placeholder = "Standort auswählen", 
  userLocationOnly = false,
  disabled = false,
  className 
}: LocationSelectorProps) {
  const { locationOptions, isLoading } = useLocations(true, userLocationOnly);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Lade Standorte..." />
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
        {locationOptions.map((location) => (
          <SelectItem key={location.value} value={location.value}>
            {location.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
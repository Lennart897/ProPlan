// Status mapping for manufacturing projects
export const PROJECT_STATUS = {
  ERFASSUNG: 1,
  PRUEFUNG_VERTRIEB: 2, 
  PRUEFUNG_SUPPLY_CHAIN: 3,
  PRUEFUNG_PLANUNG: 4,
  GENEHMIGT: 5,
  ABGELEHNT: 6,
  ABGESCHLOSSEN: 7
} as const;

export const STATUS_LABELS = {
  1: "Erfassung",
  2: "Prüfung Vertrieb", 
  3: "Prüfung SupplyChain",
  4: "Prüfung Planung Standort",
  5: "Genehmigt",
  6: "Abgelehnt",
  7: "Abgeschlossen"
} as const;

export const STATUS_COLORS = {
  1: "bg-slate-100 text-slate-800",
  2: "bg-blue-100 text-blue-800",
  3: "bg-yellow-100 text-yellow-800", 
  4: "bg-orange-100 text-orange-800",
  5: "bg-green-100 text-green-800",
  6: "bg-red-100 text-red-800",
  7: "bg-purple-100 text-purple-800"
} as const;

export type ProjectStatus = number;

export const getStatusLabel = (status: ProjectStatus): string => {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] || "Unbekannt";
};

export const getStatusColor = (status: ProjectStatus): string => {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-100 text-gray-800";
};

export const canArchiveProject = (status: ProjectStatus): boolean => {
  return [PROJECT_STATUS.GENEHMIGT, PROJECT_STATUS.ABGELEHNT, PROJECT_STATUS.ABGESCHLOSSEN].includes(status);
};
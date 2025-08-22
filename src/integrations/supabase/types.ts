export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      manufacturing_projects: {
        Row: {
          archived: boolean
          archived_at: string | null
          artikel_bezeichnung: string
          artikel_nummer: string
          beschreibung: string | null
          created_at: string
          created_by_id: string | null
          created_by_name: string
          customer: string
          erste_anlieferung: string | null
          gesamtmenge: number
          id: string
          letzte_anlieferung: string | null
          menge_fix: boolean | null
          preis: number | null
          produktgruppe: string | null
          project_number: number
          rejection_reason: string | null
          standort_verteilung: Json | null
          status: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          artikel_bezeichnung: string
          artikel_nummer: string
          beschreibung?: string | null
          created_at?: string
          created_by_id?: string | null
          created_by_name: string
          customer: string
          erste_anlieferung?: string | null
          gesamtmenge: number
          id?: string
          letzte_anlieferung?: string | null
          menge_fix?: boolean | null
          preis?: number | null
          produktgruppe?: string | null
          project_number?: number
          rejection_reason?: string | null
          standort_verteilung?: Json | null
          status?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          artikel_bezeichnung?: string
          artikel_nummer?: string
          beschreibung?: string | null
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          customer?: string
          erste_anlieferung?: string | null
          gesamtmenge?: number
          id?: string
          letzte_anlieferung?: string | null
          menge_fix?: boolean | null
          preis?: number | null
          produktgruppe?: string | null
          project_number?: number
          rejection_reason?: string | null
          standort_verteilung?: Json | null
          status?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_history: {
        Row: {
          action: string
          created_at: string
          id: string
          new_status: string | null
          previous_status: string | null
          project_id: string
          reason: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          project_id: string
          reason?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          project_id?: string
          reason?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_projects_with_status_label"
            referencedColumns: ["id"]
          },
        ]
      }
      project_location_approvals: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          location: string
          project_id: string
          required: boolean
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          location: string
          project_id: string
          required?: boolean
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          location?: string
          project_id?: string
          required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_location_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_location_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_projects_with_status_label"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          priority: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          priority?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          priority?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      manufacturing_projects_with_status_label: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          artikel_bezeichnung: string | null
          artikel_nummer: string | null
          beschreibung: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_name: string | null
          customer: string | null
          erste_anlieferung: string | null
          gesamtmenge: number | null
          id: string | null
          letzte_anlieferung: string | null
          menge_fix: boolean | null
          preis: number | null
          produktgruppe: string | null
          project_number: number | null
          rejection_reason: string | null
          standort_verteilung: Json | null
          status: number | null
          status_color: string | null
          status_label: string | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          artikel_bezeichnung?: string | null
          artikel_nummer?: string | null
          beschreibung?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          customer?: string | null
          erste_anlieferung?: string | null
          gesamtmenge?: number | null
          id?: string | null
          letzte_anlieferung?: string | null
          menge_fix?: boolean | null
          preis?: number | null
          produktgruppe?: string | null
          project_number?: number | null
          rejection_reason?: string | null
          standort_verteilung?: Json | null
          status?: number | null
          status_color?: never
          status_label?: never
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          artikel_bezeichnung?: string | null
          artikel_nummer?: string | null
          beschreibung?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          customer?: string | null
          erste_anlieferung?: string | null
          gesamtmenge?: number | null
          id?: string | null
          letzte_anlieferung?: string | null
          menge_fix?: boolean | null
          preis?: number | null
          produktgruppe?: string | null
          project_number?: number | null
          rejection_reason?: string | null
          standort_verteilung?: Json | null
          status?: number | null
          status_color?: never
          status_label?: never
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_user_approve_project: {
        Args: { project_id: string; user_uuid: string }
        Returns: boolean
      }
      create_location_approvals_for_project: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      get_affected_locations: {
        Args: { standort_verteilung: Json }
        Returns: string[]
      }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: string
      }
      handle_planning_correction: {
        Args: {
          p_gesamtmenge: number
          p_project_id: string
          p_standort_verteilung: Json
          p_status: number
        }
        Returns: undefined
      }
      is_project_pending_for_user_location: {
        Args: { p_project_id: string; user_uuid: string }
        Returns: boolean
      }
      refresh_project_status_from_approvals: {
        Args: { p_project_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "vertrieb"
        | "supply_chain"
        | "planung"
        | "planung_storkow"
        | "planung_brenz"
        | "planung_gudensberg"
        | "planung_doebeln"
        | "planung_visbek"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "user",
        "vertrieb",
        "supply_chain",
        "planung",
        "planung_storkow",
        "planung_brenz",
        "planung_gudensberg",
        "planung_doebeln",
        "planung_visbek",
      ],
    },
  },
} as const

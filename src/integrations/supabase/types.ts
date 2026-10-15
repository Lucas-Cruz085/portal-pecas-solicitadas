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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
          username: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
          username: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      demand_requests: {
        Row: {
          branch: string | null
          created_at: string
          customer_contact: string | null
          customer_name: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          quantity: number | null
          reference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_name?: string | null
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["request_kind"]
          quantity?: number | null
          reference: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_name?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          quantity?: number | null
          reference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          needs_password_change: boolean
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          needs_password_change?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          needs_password_change?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      stock_imports: {
        Row: {
          file_name: string | null
          id: string
          imported_at: string
          imported_by: string
          item_count: number
        }
        Insert: {
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by: string
          item_count?: number
        }
        Update: {
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string
          item_count?: number
        }
        Relationships: []
      }
      stock_import_staging: {
        Row: {
          batch_id: string
          created_at: string
          description: string
          quantity: number
          reference: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          description?: string
          quantity?: number
          reference: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          description?: string
          quantity?: number
          reference?: string
        }
        Relationships: []
      }
      stock_items_normaq: {
        Row: {
          branch: string
          description: string
          quantity: number
          reference: string
          updated_at: string
        }
        Insert: {
          branch: string
          description?: string
          quantity?: number
          reference: string
          updated_at?: string
        }
        Update: {
          branch?: string
          description?: string
          quantity?: number
          reference?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          description: string
          quantity: number
          reference: string
          updated_at: string
        }
        Insert: {
          description?: string
          quantity?: number
          reference: string
          updated_at?: string
        }
        Update: {
          description?: string
          quantity?: number
          reference?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allowed: boolean
          id: string
          panel: Database["public"]["Enums"]["app_panel"]
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          id?: string
          panel: Database["public"]["Enums"]["app_panel"]
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          id?: string
          panel?: Database["public"]["Enums"]["app_panel"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      demand_ranking: {
        Args: { _from?: string; _search?: string; _to?: string; _user?: string }
        Returns: {
          branch: string
          current_stock: number
          description: string
          last_requested: string
          reference: string
          requesters: string
          total_quantity: number
          total_requests: number
        }[]
      }
      demand_ranking_by_branch: {
        Args: { _from?: string; _search?: string; _to?: string; _user?: string }
        Returns: {
          branch: string
          current_stock: number
          description: string
          last_requested: string
          reference: string
          requesters: string
          total_quantity: number
          total_requests: number
        }[]
      }
      has_panel_access: {
        Args: {
          _panel: Database["public"]["Enums"]["app_panel"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      latest_stock_import: {
        Args: Record<PropertyKey, never>
        Returns: {
          imported_at: string
          item_count: number
        }[]
      }
      commit_stock_import: {
        Args: { _batch: string; _by: string; _file: string }
        Returns: {
          id: string
          imported_at: string
          item_count: number
        }[]
      }
    }
    Enums: {
      app_panel:
        | "inicio"
        | "solicitar"
        | "relatorio"
        | "importar"
        | "usuarios"
        | "auditoria"
      app_role: "admin" | "consultor"
      request_kind: "estoque" | "manual"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_panel: [
        "inicio",
        "solicitar",
        "relatorio",
        "importar",
        "usuarios",
        "auditoria",
      ],
      app_role: ["admin", "consultor"],
      request_kind: ["estoque", "manual"],
    },
  },
} as const

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          password_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          password_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          password_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_operations: {
        Row: {
          accepted: boolean;
          action: string;
          created_at: string;
          document_id: string;
          id: string;
          input_preview: string;
          output_preview: string;
          prompt: string;
        };
        Insert: {
          accepted?: boolean;
          action: string;
          created_at?: string;
          document_id: string;
          id?: string;
          input_preview?: string;
          output_preview?: string;
          prompt?: string;
        };
        Update: {
          accepted?: boolean;
          action?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          input_preview?: string;
          output_preview?: string;
          prompt?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_operations_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          content_html: string;
          content_json: Json;
          created_at: string;
          document_id: string;
          id: string;
          label: string;
          source: string;
          summary: string;
        };
        Insert: {
          content_html: string;
          content_json?: Json;
          created_at?: string;
          document_id: string;
          id?: string;
          label: string;
          source: string;
          summary?: string;
        };
        Update: {
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          document_id?: string;
          id?: string;
          label?: string;
          source?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          content_html: string;
          content_json: Json;
          created_at: string;
          id: string;
          plain_text: string;
          title: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          id?: string;
          plain_text?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          content_html?: string;
          content_json?: Json;
          created_at?: string;
          id?: string;
          plain_text?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      monitor_api_logs: {
        Row: {
          cost_unit: number;
          created_at: string;
          endpoint: string;
          id: string;
          platform: string;
          request_fingerprint: string;
          response_code: number;
          source_id: string | null;
          user_id: string | null;
        };
        Insert: {
          cost_unit?: number;
          created_at?: string;
          endpoint?: string;
          id?: string;
          platform: string;
          request_fingerprint?: string;
          response_code?: number;
          source_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          cost_unit?: number;
          created_at?: string;
          endpoint?: string;
          id?: string;
          platform?: string;
          request_fingerprint?: string;
          response_code?: number;
          source_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monitor_api_logs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "monitor_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      monitor_items: {
        Row: {
          content_text: string;
          cost_calls: number;
          cover_url: string;
          created_at: string;
          fetch_stage: string;
          id: string;
          item_id: string;
          metrics: Json;
          platform: string;
          published_at: string | null;
          source_id: string | null;
          source_url: string;
          summary: string;
          title: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          content_text?: string;
          cost_calls?: number;
          cover_url?: string;
          created_at?: string;
          fetch_stage?: string;
          id?: string;
          item_id: string;
          metrics?: Json;
          platform: string;
          published_at?: string | null;
          source_id?: string | null;
          source_url?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          content_text?: string;
          cost_calls?: number;
          cover_url?: string;
          created_at?: string;
          fetch_stage?: string;
          id?: string;
          item_id?: string;
          metrics?: Json;
          platform?: string;
          published_at?: string | null;
          source_id?: string | null;
          source_url?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monitor_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "monitor_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      monitor_sources: {
        Row: {
          created_at: string;
          creator_id: string;
          creator_name: string;
          daily_budget_calls: number;
          id: string;
          last_polled_at: string | null;
          last_seen_item_id: string;
          last_seen_published_at: string | null;
          platform: string;
          poll_interval_minutes: number;
          priority: number;
          source_url: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          creator_id?: string;
          creator_name?: string;
          daily_budget_calls?: number;
          id?: string;
          last_polled_at?: string | null;
          last_seen_item_id?: string;
          last_seen_published_at?: string | null;
          platform: string;
          poll_interval_minutes?: number;
          priority?: number;
          source_url: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          creator_name?: string;
          daily_budget_calls?: number;
          id?: string;
          last_polled_at?: string | null;
          last_seen_item_id?: string;
          last_seen_published_at?: string | null;
          platform?: string;
          poll_interval_minutes?: number;
          priority?: number;
          source_url?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      model_pricing: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          input_cost_per_million: number;
          model: string;
          notes: string | null;
          output_cost_per_million: number;
          provider: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          input_cost_per_million: number;
          model: string;
          notes?: string | null;
          output_cost_per_million: number;
          provider: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          input_cost_per_million?: number;
          model?: string;
          notes?: string | null;
          output_cost_per_million?: number;
          provider?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recharge_orders: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          notify_payload: Json;
          out_trade_no: string;
          paid_at: string | null;
          pay_payload: Json;
          pay_type: string;
          pay_url: string;
          pay_url2: string;
          provider: string;
          provider_trade_no: string | null;
          qrcode_img: string;
          qrcode_url: string;
          status: string;
          subject: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          notify_payload?: Json;
          out_trade_no: string;
          paid_at?: string | null;
          pay_payload?: Json;
          pay_type: string;
          pay_url?: string;
          pay_url2?: string;
          provider?: string;
          provider_trade_no?: string | null;
          qrcode_img?: string;
          qrcode_url?: string;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          notify_payload?: Json;
          out_trade_no?: string;
          paid_at?: string | null;
          pay_payload?: Json;
          pay_type?: string;
          pay_url?: string;
          pay_url2?: string;
          provider?: string;
          provider_trade_no?: string | null;
          qrcode_img?: string;
          qrcode_url?: string;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_wallets: {
        Row: {
          balance: number;
          created_at: string;
          total_consumed: number;
          total_recharged: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          balance?: number;
          created_at?: string;
          total_consumed?: number;
          total_recharged?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          created_at?: string;
          total_consumed?: number;
          total_recharged?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at: string;
          direction: string;
          id: string;
          kind: string;
          metadata: Json;
          related_order_id: string | null;
          user_id: string;
        };
        Insert: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at?: string;
          direction: string;
          id?: string;
          kind: string;
          metadata?: Json;
          related_order_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          created_at?: string;
          direction?: string;
          id?: string;
          kind?: string;
          metadata?: Json;
          related_order_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_related_order_id_fkey";
            columns: ["related_order_id"];
            isOneToOne: false;
            referencedRelation: "recharge_orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_wallet_consumption: {
        Args: {
          p_amount: number;
          p_metadata?: Json;
          p_user_id: string;
        };
        Returns: boolean;
      };
      apply_recharge_success: {
        Args: {
          p_amount: number;
          p_notify_payload: Json;
          p_out_trade_no: string;
          p_paid_at?: string;
          p_provider_trade_no?: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

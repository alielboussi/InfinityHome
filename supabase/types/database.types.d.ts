// AUTO-GENERATED TYPES PLACEHOLDER
// Run the documented generation command to replace this with real schema types.
// Example minimal shape (extend once generated):

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      laybys: {
        Row: { id: string; customer_id: string; sale_id: number | null; total_amount: number | null; paid_amount: number | null; created_at?: string | null; updated_at?: string | null };
        Insert: { id?: string; customer_id: string; sale_id?: number | null; total_amount?: number | null; paid_amount?: number | null };
        Update: { id?: string; customer_id?: string; sale_id?: number | null; total_amount?: number | null; paid_amount?: number | null };
        Relationships: [];
      };
      sales: {
        Row: { id: number; layby_id: string | null; sale_date: string | null; status: string | null; discount: number | null; currency: string | null };
        Insert: { id?: number; layby_id?: string | null; sale_date?: string | null; status?: string | null; discount?: number | null; currency?: string | null };
        Update: { id?: number; layby_id?: string | null; sale_date?: string | null; status?: string | null; discount?: number | null; currency?: string | null };
        Relationships: [];
      };
      sales_payments: {
        Row: { id: number; sale_id: number; payment_type: string | null; amount: number | null; currency: string | null; payment_date: string | null; notes: string | null; allocation_batch_uuid: string | null };
        Insert: { id?: number; sale_id: number; payment_type?: string | null; amount?: number | null; currency?: string | null; payment_date?: string | null; notes?: string | null; allocation_batch_uuid?: string | null };
        Update: { id?: number; sale_id?: number; payment_type?: string | null; amount?: number | null; currency?: string | null; payment_date?: string | null; notes?: string | null; allocation_batch_uuid?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
}

export type PublicSchema = Database['public'];

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
      auth_user_map: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          public_user_id: number
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          public_user_id: number
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          public_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_user_map_public_user_id_fkey"
            columns: ["public_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      closing_stock_entries: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          qty: number | null
          session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          qty?: number | null
          session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          qty?: number | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closing_stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_stock_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_items: {
        Row: {
          combo_id: number | null
          id: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          combo_id?: number | null
          id: number
          product_id?: string | null
          quantity: number
        }
        Update: {
          combo_id?: number | null
          id?: number
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_locations: {
        Row: {
          assembled_qty: number
          combo_id: number
          created_at: string | null
          id: number
          location_id: string
          updated_at: string | null
        }
        Insert: {
          assembled_qty?: number
          combo_id: number
          created_at?: string | null
          id: number
          location_id: string
          updated_at?: string | null
        }
        Update: {
          assembled_qty?: number
          combo_id?: number
          created_at?: string | null
          id?: number
          location_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_combo"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
      combos: {
        Row: {
          category_id: number | null
          combo_name: string
          combo_price: number
          created_at: string | null
          currency: string | null
          id: number
          picture_url: string | null
          product_id: string | null
          promo_end_date: string | null
          promo_start_date: string | null
          promotional_price: number | null
          sku: string | null
          standard_price: number | null
          unit_of_measure_id: number | null
        }
        Insert: {
          category_id?: number | null
          combo_name: string
          combo_price: number
          created_at?: string | null
          currency?: string | null
          id: number
          picture_url?: string | null
          product_id?: string | null
          promo_end_date?: string | null
          promo_start_date?: string | null
          promotional_price?: number | null
          sku?: string | null
          standard_price?: number | null
          unit_of_measure_id?: number | null
        }
        Update: {
          category_id?: number | null
          combo_name?: string
          combo_price?: number
          created_at?: string | null
          currency?: string | null
          id?: number
          picture_url?: string | null
          product_id?: string | null
          promo_end_date?: string | null
          promo_start_date?: string | null
          promotional_price?: number | null
          sku?: string | null
          standard_price?: number | null
          unit_of_measure_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "combos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combos_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "unit_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_address: string
          company_email: string
          company_logo: string | null
          company_name: string
          company_phone: string
          company_tpin: string
          created_at: string | null
          id: number
          updated_at: string | null
        }
        Insert: {
          company_address: string
          company_email: string
          company_logo?: string | null
          company_name: string
          company_phone: string
          company_tpin: string
          created_at?: string | null
          id: number
          updated_at?: string | null
        }
        Update: {
          company_address?: string
          company_email?: string
          company_logo?: string | null
          company_name?: string
          company_phone?: string
          company_tpin?: string
          created_at?: string | null
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          credit_balance: number
          currency: string | null
          id: string
          name: string | null
          opening_balance: number
          phone: string | null
          tpin: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_balance?: number
          currency?: string | null
          id?: string
          name?: string | null
          opening_balance?: number
          phone?: string | null
          tpin?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_balance?: number
          currency?: string | null
          id?: string
          name?: string | null
          opening_balance?: number
          phone?: string | null
          tpin?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      factory_sold_storage_events: {
        Row: {
          after_quantity: number | null
          before_quantity: number | null
          created_at: string
          created_by: string | null
          created_by_user_id: number | null
          event_type: string
          id: number
          metadata: Json | null
          notes: string | null
          quantity: number | null
          storage_id: string
        }
        Insert: {
          after_quantity?: number | null
          before_quantity?: number | null
          created_at?: string
          created_by?: string | null
          created_by_user_id?: number | null
          event_type: string
          id?: number
          metadata?: Json | null
          notes?: string | null
          quantity?: number | null
          storage_id: string
        }
        Update: {
          after_quantity?: number | null
          before_quantity?: number | null
          created_at?: string
          created_by?: string | null
          created_by_user_id?: number | null
          event_type?: string
          id?: number
          metadata?: Json | null
          notes?: string | null
          quantity?: number | null
          storage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_sold_storage_events_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "factory_sold_storage_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_events_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "v_factory_sold_storage_active"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_sold_storage_items: {
        Row: {
          created_by: string | null
          created_by_user_id: number | null
          customer_name: string | null
          customer_phone: string | null
          expected_release_date: string | null
          id: string
          location_id: string
          metadata: Json | null
          notes: string | null
          product_id: string
          quantity: number
          quantity_released: number
          release_reference: string | null
          released_at: string | null
          sale_id: number | null
          sale_item_id: number | null
          status: string
          stored_at: string
          updated_at: string
          updated_by: string | null
          updated_by_user_id: number | null
        }
        Insert: {
          created_by?: string | null
          created_by_user_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_release_date?: string | null
          id?: string
          location_id: string
          metadata?: Json | null
          notes?: string | null
          product_id: string
          quantity?: number
          quantity_released?: number
          release_reference?: string | null
          released_at?: string | null
          sale_id?: number | null
          sale_item_id?: number | null
          status?: string
          stored_at?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: number | null
        }
        Update: {
          created_by?: string | null
          created_by_user_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_release_date?: string | null
          id?: string
          location_id?: string
          metadata?: Json | null
          notes?: string | null
          product_id?: string
          quantity?: number
          quantity_released?: number
          release_reference?: string | null
          released_at?: string | null
          sale_id?: number | null
          sale_item_id?: number | null
          status?: string
          stored_at?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sales_items"
            referencedColumns: ["id"]
          },
        ]
      }
      incomplete_packages: {
        Row: {
          combo_id: number | null
          created_at: string
          id: number
          item_name: string | null
          location_id: string
          notes: string | null
          quantity: number
        }
        Insert: {
          combo_id?: number | null
          created_at?: string
          id: number
          item_name?: string | null
          location_id: string
          notes?: string | null
          quantity?: number
        }
        Update: {
          combo_id?: number | null
          created_at?: string
          id?: number
          item_name?: string | null
          location_id?: string
          notes?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "incomplete_packages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomplete_packages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: number
          location: string
          product_id: string | null
          quantity: number
          updated_at: string | null
        }
        Insert: {
          id?: number
          location: string
          product_id?: string | null
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          id?: number
          location?: string
          product_id?: string | null
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_fkey"
            columns: ["location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_fkey"
            columns: ["location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjusted_at: string
          adjustment_type: string
          id: string
          location_id: string
          metadata: Json | null
          product_id: string
          quantity: number
        }
        Insert: {
          adjusted_at?: string
          adjustment_type: string
          id?: string
          location_id: string
          metadata?: Json | null
          product_id: string
          quantity: number
        }
        Update: {
          adjusted_at?: string
          adjustment_type?: string
          id?: string
          location_id?: string
          metadata?: Json | null
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      label_print_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload: Json
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          status?: string
        }
        Relationships: []
      }
      layby_payments: {
        Row: {
          allocation_batch_uuid: string | null
          amount: number | null
          created_at: string | null
          currency: string | null
          customer_id: string
          discount_amount: number
          id: string
          notes: string | null
          payment_date: string | null
          payment_type: string | null
          reference: string | null
          sale_id: number
          source_payment_id: string | null
        }
        Insert: {
          allocation_batch_uuid?: string | null
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          customer_id: string
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id: number
          source_payment_id?: string | null
        }
        Update: {
          allocation_batch_uuid?: string | null
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id?: number
          source_payment_id?: string | null
        }
        Relationships: []
      }
      laybys: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          notes: string | null
          origin: string | null
          paid_amount: number | null
          sale_id: number | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          paid_amount?: number | null
          sale_id?: number | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          origin?: string | null
          paid_amount?: number | null
          sale_id?: number | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_laybys_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_laybys_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_laybys_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_laybys_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_laybys_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_laybys_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          id: string
          location_id: string | null
          reason: string
          reference: string | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          id?: string
          location_id?: string | null
          reason: string
          reference?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          id?: string
          location_id?: string | null
          reason?: string
          reference?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      opening_stock_entries: {
        Row: {
          id: string
          product_id: string | null
          qty: number | null
          session_id: string | null
          stocktake_conductor: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          qty?: number | null
          session_id?: string | null
          stocktake_conductor?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          qty?: number | null
          session_id?: string | null
          stocktake_conductor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          product_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          product_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_locations: {
        Row: {
          id: string
          location_id: string | null
          product_id: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          product_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: number | null
          cost_price: number | null
          created_at: string | null
          currency: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          promo_end_date: string | null
          promo_start_date: string | null
          promotional_price: number | null
          sku: string
          sku_type: boolean
          standard_price: number | null
          unit_of_measure_id: number | null
          updated_at: string | null
        }
        Insert: {
          category_id?: number | null
          cost_price?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          promo_end_date?: string | null
          promo_start_date?: string | null
          promotional_price?: number | null
          sku: string
          sku_type?: boolean
          standard_price?: number | null
          unit_of_measure_id?: number | null
          updated_at?: string | null
        }
        Update: {
          category_id?: number | null
          cost_price?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          promo_end_date?: string | null
          promo_start_date?: string | null
          promotional_price?: number | null
          sku?: string
          sku_type?: boolean
          standard_price?: number | null
          unit_of_measure_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "unit_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name_override: string | null
          product_id: string | null
          quantity: number
          quotation_id: string
          quote_product_id: string | null
          sort_order: number | null
          unit_id: number | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name_override?: string | null
          product_id?: string | null
          quantity?: number
          quotation_id: string
          quote_product_id?: string | null
          sort_order?: number | null
          unit_id?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name_override?: string | null
          product_id?: string | null
          quantity?: number
          quotation_id?: string
          quote_product_id?: string | null
          sort_order?: number | null
          unit_id?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_quotation_items_quote"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quote_product_id_fkey"
            columns: ["quote_product_id"]
            isOneToOne: false
            referencedRelation: "quotation_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "quotation_units"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_products: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          qr_code_url: string | null
          quote_sku: string | null
          unit_id: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          qr_code_url?: string | null
          quote_sku?: string | null
          unit_id?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          qr_code_url?: string | null
          quote_sku?: string | null
          unit_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "quotation_units"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_units: {
        Row: {
          abbreviation: string | null
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          abbreviation?: string | null
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      quotations: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          customer_id: string | null
          discount: number
          id: string
          layby_id: string | null
          notes: string | null
          quote_number: string | null
          sale_id: number | null
          status: string
          subtotal: number
          total: number
          updated_at: string | null
          vat_apply: boolean
          vat_inclusive: boolean
          vat_rate: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount?: number
          id?: string
          layby_id?: string | null
          notes?: string | null
          quote_number?: string | null
          sale_id?: number | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string | null
          vat_apply?: boolean
          vat_inclusive?: boolean
          vat_rate?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount?: number
          id?: string
          layby_id?: string | null
          notes?: string | null
          quote_number?: string | null
          sale_id?: number | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string | null
          vat_apply?: boolean
          vat_inclusive?: boolean
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_layby_id_fkey"
            columns: ["layby_id"]
            isOneToOne: false
            referencedRelation: "laybys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "quotations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      quote_customers: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tpin: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tpin?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tpin?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          currency: string | null
          customer_id: string | null
          discount: number | null
          id: number
          layby_id: string | null
          location_id: string | null
          receipt_number: string | null
          reminder_date: string | null
          sale_date: string | null
          sale_id: string | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: number | null
          user_uid: string | null
          vat_apply: boolean
          vat_inclusive: boolean
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          discount?: number | null
          id?: number
          layby_id?: string | null
          location_id?: string | null
          receipt_number?: string | null
          reminder_date?: string | null
          sale_date?: string | null
          sale_id?: string | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
          user_id?: number | null
          user_uid?: string | null
          vat_apply?: boolean
          vat_inclusive?: boolean
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          discount?: number | null
          id?: number
          layby_id?: string | null
          location_id?: string | null
          receipt_number?: string | null
          reminder_date?: string | null
          sale_date?: string | null
          sale_id?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: number | null
          user_uid?: string | null
          vat_apply?: boolean
          vat_inclusive?: boolean
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_layby_id_fkey"
            columns: ["layby_id"]
            isOneToOne: false
            referencedRelation: "laybys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "sales_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_items: {
        Row: {
          color: string | null
          currency: string | null
          display_name: string | null
          id: number
          product_id: string | null
          quantity: number
          sale_id: number | null
          unit_price: number
        }
        Insert: {
          color?: string | null
          currency?: string | null
          display_name?: string | null
          id?: number
          product_id?: string | null
          quantity: number
          sale_id?: number | null
          unit_price: number
        }
        Update: {
          color?: string | null
          currency?: string | null
          display_name?: string | null
          id?: number
          product_id?: string | null
          quantity?: number
          sale_id?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      sales_items_dupe_archive: {
        Row: {
          color: string | null
          currency: string | null
          display_name: string | null
          id: number
          product_id: string | null
          quantity: number
          sale_id: number | null
          unit_price: number
        }
        Insert: {
          color?: string | null
          currency?: string | null
          display_name?: string | null
          id: number
          product_id?: string | null
          quantity: number
          sale_id?: number | null
          unit_price: number
        }
        Update: {
          color?: string | null
          currency?: string | null
          display_name?: string | null
          id?: number
          product_id?: string | null
          quantity?: number
          sale_id?: number | null
          unit_price?: number
        }
        Relationships: []
      }
      sales_payments: {
        Row: {
          allocation_batch_uuid: string | null
          amount: number | null
          created_at: string
          currency: string | null
          discount_amount: number
          id: string
          notes: string | null
          payment_date: string | null
          payment_type: string | null
          reference: string | null
          sale_id: number | null
        }
        Insert: {
          allocation_batch_uuid?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id?: number | null
        }
        Update: {
          allocation_batch_uuid?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      sales_payments_credit_backup: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          id: string | null
          notes: string | null
          payment_date: string | null
          payment_type: string | null
          reference: string | null
          sale_id: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_type?: string | null
          reference?: string | null
          sale_id?: number | null
        }
        Relationships: []
      }
      stock_count_checks: {
        Row: {
          counted: number
          id: number
          location_id: string
          product_id: string
          session_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          counted?: number
          id?: number
          location_id: string
          product_id: string
          session_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          counted?: number
          id?: number
          location_id?: string
          product_id?: string
          session_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_checks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_checks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stock_count_checks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_checks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_periods: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          location_id: string
          opened_at: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          location_id: string
          opened_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string
          opened_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_periods_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_periods_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
      stock_transfer_entries: {
        Row: {
          created_at: string
          id: string
          parent_product_id: string | null
          product_id: string | null
          quantity: number
          session_id: string | null
          updated_at: string
          variant_attributes: Json | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          parent_product_id?: string | null
          product_id?: string | null
          quantity: number
          session_id?: string | null
          updated_at?: string
          variant_attributes?: Json | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_product_id?: string | null
          product_id?: string | null
          quantity?: number
          session_id?: string | null
          updated_at?: string
          variant_attributes?: Json | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_entries_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_transfer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_transfer_sessions_totals"
            referencedColumns: ["session_id"]
          },
        ]
      }
      stock_transfer_sessions: {
        Row: {
          created_at: string | null
          delivery_number: string | null
          from_location: string | null
          id: string
          metadata: Json | null
          notes: string | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["transfer_status"] | null
          to_location: string | null
          total_qty: number | null
          transfer_date: string
          transfer_datetime: string | null
          transfer_ts: string | null
          user_id: number | null
          user_uid: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_number?: string | null
          from_location?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_location?: string | null
          total_qty?: number | null
          transfer_date: string
          transfer_datetime?: string | null
          transfer_ts?: string | null
          user_id?: number | null
          user_uid?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_number?: string | null
          from_location?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_location?: string | null
          total_qty?: number | null
          transfer_date?: string
          transfer_datetime?: string | null
          transfer_ts?: string | null
          user_id?: number | null
          user_uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_user_entries: {
        Row: {
          created_at: string
          id: string
          product_id: string
          qty: number
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          qty?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_user_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_user_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stocktake_user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_user_sessions: {
        Row: {
          created_at: string
          id: string
          location_id: string
          locked_at: string | null
          period_id: string
          status: string
          submitted_at: string | null
          user_email: string | null
          user_id: number
          user_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          locked_at?: string | null
          period_id: string
          status?: string
          submitted_at?: string | null
          user_email?: string | null
          user_id: number
          user_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          locked_at?: string | null
          period_id?: string
          status?: string
          submitted_at?: string | null
          user_email?: string | null
          user_id?: number
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_user_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_user_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stocktake_user_sessions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "stock_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_of_measure: {
        Row: {
          abbreviation: string | null
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          abbreviation?: string | null
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_acl: {
        Row: {
          allowed_locations: string[] | null
          full_access: boolean | null
          user_uid: string
        }
        Insert: {
          allowed_locations?: string[] | null
          full_access?: boolean | null
          user_uid: string
        }
        Update: {
          allowed_locations?: string[] | null
          full_access?: boolean | null
          user_uid?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: number
          password: string
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: number
          password: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: number
          password?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      variant_attribute_columns: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      variant_attribute_values: {
        Row: {
          column_id: number
          created_at: string
          id: number
          is_active: boolean
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          column_id: number
          created_at?: string
          id?: number
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          column_id?: number
          created_at?: string
          id?: number
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_attribute_values_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "variant_attribute_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_delivery_entries: {
        Row: {
          combo_id: number | null
          created_at: string
          id: string
          kind: string
          max_qty: number | null
          name: string | null
          per_set_qty: number | null
          product_id: string | null
          quantity: number
          session_id: string
          sku: string | null
        }
        Insert: {
          combo_id?: number | null
          created_at?: string
          id?: string
          kind: string
          max_qty?: number | null
          name?: string | null
          per_set_qty?: number | null
          product_id?: string | null
          quantity?: number
          session_id: string
          sku?: string | null
        }
        Update: {
          combo_id?: number | null
          created_at?: string
          id?: string
          kind?: string
          max_qty?: number | null
          name?: string | null
          per_set_qty?: number | null
          product_id?: string | null
          quantity?: number
          session_id?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_delivery_entries_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "warehouse_delivery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_delivery_sessions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by_email: string | null
          created_by_id: number | null
          from_location: string
          id: string
          metadata: Json | null
          status: string
          to_location: string
          total_qty: number | null
          transfer_datetime: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_id?: number | null
          from_location: string
          id?: string
          metadata?: Json | null
          status?: string
          to_location: string
          total_qty?: number | null
          transfer_datetime?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by_email?: string | null
          created_by_id?: number | null
          from_location?: string
          id?: string
          metadata?: Json | null
          status?: string
          to_location?: string
          total_qty?: number | null
          transfer_datetime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_delivery_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "warehouse_delivery_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_delivery_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
    }
    Views: {
      ledger_balances: {
        Row: {
          balance: number | null
          currency: string | null
          entry_count: number | null
          last_entry_at: string | null
        }
        Relationships: []
      }
      v_customer_layby_outstanding: {
        Row: {
          customer_id: string | null
          first_sale_date: string | null
          last_payment_at: string | null
          last_sale_date: string | null
          layby_id: string | null
          layby_notes: string | null
          layby_outstanding: number | null
          layby_paid_amount: number | null
          layby_status: string | null
          layby_total_due: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_layby_id_fkey"
            columns: ["layby_id"]
            isOneToOne: false
            referencedRelation: "laybys"
            referencedColumns: ["id"]
          },
        ]
      }
      v_factory_sold_storage_active: {
        Row: {
          created_by: string | null
          created_by_user_id: number | null
          customer_name: string | null
          customer_phone: string | null
          expected_release_date: string | null
          id: string | null
          location_id: string | null
          metadata: Json | null
          notes: string | null
          product_id: string | null
          quantity: number | null
          quantity_released: number | null
          release_reference: string | null
          released_at: string | null
          sale_id: number | null
          sale_item_id: number | null
          status: string | null
          stored_at: string | null
          updated_at: string | null
          updated_by: string | null
          updated_by_user_id: number | null
        }
        Insert: {
          created_by?: string | null
          created_by_user_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_release_date?: string | null
          id?: string | null
          location_id?: string | null
          metadata?: Json | null
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          quantity_released?: number | null
          release_reference?: string | null
          released_at?: string | null
          sale_id?: number | null
          sale_item_id?: number | null
          status?: string | null
          stored_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: number | null
        }
        Update: {
          created_by?: string | null
          created_by_user_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_release_date?: string | null
          id?: string | null
          location_id?: string | null
          metadata?: Json | null
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          quantity_released?: number | null
          release_reference?: string | null
          released_at?: string | null
          sale_id?: number | null
          sale_item_id?: number | null
          status?: string | null
          stored_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sales_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_factory_sold_storage_summary: {
        Row: {
          first_stored_at: string | null
          holding_rows: number | null
          last_activity_at: string | null
          location_id: string | null
          product_id: string | null
          qty_on_hold: number | null
          total_qty_released: number | null
          total_qty_stored: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "factory_sold_storage_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_functions_named_pos_finalize_checkout: {
        Row: {
          args: string | null
          name: unknown
          schema: unknown
        }
        Relationships: []
      }
      v_functions_referencing_advance_balance: {
        Row: {
          args: string | null
          name: unknown
          schema: unknown
        }
        Relationships: []
      }
      v_location_transfer_totals: {
        Row: {
          location_id: string | null
          transfer_in_qty: number | null
          transfer_out_qty: number | null
        }
        Relationships: []
      }
      v_negative_inventory: {
        Row: {
          location: string | null
          location_name: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          severity: string | null
          sku: string | null
          snapshot_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_fkey"
            columns: ["location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_fkey"
            columns: ["location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_payments_non_credit: {
        Row: {
          non_credit_paid: number | null
          sale_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_financials_canonical"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_pdf_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "fk_sales_payments_sale"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_totals_canonical"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      v_sales_financials: {
        Row: {
          currency: string | null
          customer_id: string | null
          discount_amount: number | null
          last_payment_at: string | null
          location_id: string | null
          net_after_discount: number | null
          outstanding_amount: number | null
          paid_amount: number | null
          sale_date: string | null
          sale_id: number | null
          status: string | null
          subtotal_before_discount: number | null
          total_due: number | null
          vat_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
      v_sales_financials_canonical: {
        Row: {
          currency: string | null
          customer_id: string | null
          layby_id: string | null
          outstanding_amount: number | null
          paid_amount: number | null
          sale_date: string | null
          sale_id: number | null
          status: string | null
          total_due: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_layby_id_fkey"
            columns: ["layby_id"]
            isOneToOne: false
            referencedRelation: "laybys"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_pdf_totals: {
        Row: {
          currency: string | null
          discount_amount: number | null
          outstanding_amount: number | null
          paid_amount: number | null
          sale_id: number | null
          subtotal_before_discount: number | null
          total_due: number | null
        }
        Relationships: []
      }
      v_sales_totals_canonical: {
        Row: {
          currency: string | null
          customer_id: string | null
          layby_id: string | null
          sale_date: string | null
          sale_id: number | null
          status: string | null
          total_due: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_layby_id_fkey"
            columns: ["layby_id"]
            isOneToOne: false
            referencedRelation: "laybys"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transfer_sessions_totals: {
        Row: {
          from_location: string | null
          session_id: string | null
          to_location: string | null
          total_qty: number | null
          transfer_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_sessions_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "v_location_transfer_totals"
            referencedColumns: ["location_id"]
          },
        ]
      }
    }
    Functions: {
      _enable_rls_if_exists: { Args: { tablename: string }; Returns: undefined }
      _test_payments_trigger_once: {
        Args: { p_trigger: string }
        Returns: string
      }
      _user_can_access_location: { Args: { loc: string }; Returns: boolean }
      adjust_inventory_delta: {
        Args: { p_delta: number; p_location: string; p_product: string }
        Returns: undefined
      }
      app_login: {
        Args: { p_email: string; p_password: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: number
          role: string
        }[]
      }
      approve_stock_transfer: {
        Args: { p_pdf_url: string; p_session_id: string; p_user?: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      ensure_policy: {
        Args: { p_cmd: string; p_policy: string; p_table: string }
        Returns: undefined
      }
      execute_sql: { Args: { sql: string }; Returns: undefined }
      fn_recalc_sale_total: { Args: { p_sale_id: number }; Returns: undefined }
      fn_refresh_layby_snapshots: {
        Args: { p_layby: string }
        Returns: undefined
      }
      fn_sync_layby_paid_amount: {
        Args: { p_sale_id: number }
        Returns: undefined
      }
      fn_update_layby_for_sale: {
        Args: { p_sale_id: number }
        Returns: undefined
      }
      generate_quote_number: { Args: never; Returns: string }
      get_layby_statement: {
        Args: { p_customer_id: string; p_layby_id: string }
        Returns: Json
      }
      inventory_negative_alert_payload: {
        Args: { p_min_severity?: string }
        Returns: Json
      }
      is_layby_sale: { Args: { p_sale_id: number }; Returns: boolean }
      password_matches: {
        Args: { p_password: string; p_stored: string }
        Returns: boolean
      }
      perform_product_transfer: {
        Args: {
          _delivery_number?: string
          _from: string
          _product_id: string
          _qty: number
          _to: string
          _transfer_date?: string
          _user_id: number
        }
        Returns: string
      }
      pos_finalize_checkout:
        | {
            Args: {
              p_create_layby?: boolean
              p_currency: string
              p_customer_id: string
              p_discount: number
              p_immediate_payment?: number
              p_items: Json
              p_location_id: string
              p_payment_ref?: string
              p_payment_type?: string
              p_receipt_number: string
              p_sale_date: string
              p_status: string
              p_total: number
            }
            Returns: {
              layby_id: string
              sale_id: number
            }[]
          }
        | { Args: { p_payload: Json }; Returns: Json }
      pos_finalize_checkout_atomic: { Args: { p_payload: Json }; Returns: Json }
      pos_finalize_checkout_disabled: {
        Args: { p_payload: Json }
        Returns: Json
      }
      recalc_layby_paid_amount_from_downpayments: {
        Args: { p_layby_id: string }
        Returns: undefined
      }
      recalc_layby_paid_amount_from_sale: {
        Args: { p_sale_id: number }
        Returns: undefined
      }
      recalc_layby_rollup: { Args: { p_layby_id: string }; Returns: undefined }
      recalc_transfer_total: { Args: { p_session: string }; Returns: undefined }
      stock_count_add: {
        Args: {
          p_delta: number
          p_location_id: string
          p_product_id: string
          p_session_id: string
        }
        Returns: number
      }
      stocktake_summary: {
        Args: { p_location: string }
        Returns: {
          amount: number
          closing: number
          expected_closing: number
          name: string
          opening: number
          product_id: string
          promotional_price: number
          sales: number
          sku: string
          standard_price: number
          transfer_in: number
          variance: number
        }[]
      }
      upsert_inventory_abs: {
        Args: { p_location: string; p_product: string; p_quantity: number }
        Returns: undefined
      }
    }
    Enums: {
      transfer_status:
        | "draft"
        | "approved"
        | "dispatched"
        | "received"
        | "cancelled"
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
      transfer_status: [
        "draft",
        "approved",
        "dispatched",
        "received",
        "cancelled",
      ],
    },
  },
} as const

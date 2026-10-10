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
      ajustes_caja: {
        Row: {
          created_at: string
          fecha: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ajustes_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ajustes_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ajustes_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ajustes_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          destino_efectivo: boolean
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          saldo_inicial_centavos: number
        }
        Insert: {
          destino_efectivo?: boolean
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          saldo_inicial_centavos?: number
        }
        Update: {
          destino_efectivo?: boolean
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          saldo_inicial_centavos?: number
        }
        Relationships: []
      }
      cargas_revendedor: {
        Row: {
          admin_id: string
          clave: string
          created_at: string
          entrega_id: string | null
          grupo_ids: string[]
          pedido: Json
          rendicion_id: string | null
          vendedor_id: string
        }
        Insert: {
          admin_id: string
          clave: string
          created_at?: string
          entrega_id?: string | null
          grupo_ids?: string[]
          pedido: Json
          rendicion_id?: string | null
          vendedor_id: string
        }
        Update: {
          admin_id?: string
          clave?: string
          created_at?: string
          entrega_id?: string | null
          grupo_ids?: string[]
          pedido?: Json
          rendicion_id?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_revendedor_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas_revendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_revendedor_rendicion_id_fkey"
            columns: ["rendicion_id"]
            isOneToOne: false
            referencedRelation: "rendiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_revendedor_rendicion_id_fkey"
            columns: ["rendicion_id"]
            isOneToOne: false
            referencedRelation: "v_rendiciones_ananja"
            referencedColumns: ["rendicion_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cargas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_gasto: {
        Row: {
          activa: boolean
          es_costo_produccion: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          es_costo_produccion?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          es_costo_produccion?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          created_at: string
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          nota: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          nota?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          nota?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cobros: {
        Row: {
          comprobante_id: string
          created_at: string
          fecha: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string | null
          vendedor_id: string
        }
        Insert: {
          comprobante_id: string
          created_at?: string
          fecha?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota?: string | null
          vendedor_id: string
        }
        Update: {
          comprobante_id?: string
          created_at?: string
          fecha?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_comprobante"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "cobros_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobante_items: {
        Row: {
          cantidad: number
          comprobante_id: string
          costo_lote_unitario_centavos: number | null
          costo_produccion_unitario_centavos: number | null
          id: string
          lote_id: string | null
          precio_unitario_centavos: number | null
          producto_id: string
        }
        Insert: {
          cantidad: number
          comprobante_id: string
          costo_lote_unitario_centavos?: number | null
          costo_produccion_unitario_centavos?: number | null
          id?: string
          lote_id?: string | null
          precio_unitario_centavos?: number | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          comprobante_id?: string
          costo_lote_unitario_centavos?: number | null
          costo_produccion_unitario_centavos?: number | null
          id?: string
          lote_id?: string | null
          precio_unitario_centavos?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_items_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_comprobante"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "comprobante_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "comprobante_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          cliente_id: string | null
          cobrado_centavos: number
          created_at: string
          estado_ocr: Database["public"]["Enums"]["estado_ocr"]
          fecha: string
          feria_id: string | null
          id: string
          imagen_path: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string | null
          ocr_monto_centavos: number | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          cliente_id?: string | null
          cobrado_centavos?: number
          created_at?: string
          estado_ocr?: Database["public"]["Enums"]["estado_ocr"]
          fecha?: string
          feria_id?: string | null
          id?: string
          imagen_path?: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota?: string | null
          ocr_monto_centavos?: number | null
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          cliente_id?: string | null
          cobrado_centavos?: number
          created_at?: string
          estado_ocr?: Database["public"]["Enums"]["estado_ocr"]
          fecha?: string
          feria_id?: string | null
          id?: string
          imagen_path?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string | null
          ocr_monto_centavos?: number | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "comprobantes_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "ferias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_feria_totales"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "comprobantes_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_resultado_feria"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_negocio: {
        Row: {
          id: boolean
          proveedor_nombre: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          proveedor_nombre?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          proveedor_nombre?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      depositos_cuenta: {
        Row: {
          created_at: string
          fecha: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string | null
          tenedor_id: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota?: string | null
          tenedor_id: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string | null
          tenedor_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depositos_cuenta_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_cuenta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_cuenta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos_informados: {
        Row: {
          created_at: string
          deposito_id: string | null
          estado: string
          fecha: string
          id: string
          imagen_path: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          motivo_rechazo: string | null
          nota: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          tenedor_id: string
        }
        Insert: {
          created_at?: string
          deposito_id?: string | null
          estado?: string
          fecha: string
          id?: string
          imagen_path?: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          motivo_rechazo?: string | null
          nota?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          tenedor_id: string
        }
        Update: {
          created_at?: string
          deposito_id?: string | null
          estado?: string
          fecha?: string
          id?: string
          imagen_path?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          motivo_rechazo?: string | null
          nota?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          tenedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depositos_informados_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_informados_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "depositos_informados_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_informados_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "depositos_informados_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "depositos_informados_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      deudas: {
        Row: {
          created_at: string
          descripcion: string
          fecha: string
          id: string
          lote_id: string | null
          moneda: string
          monto_centavos: number
          nota: string | null
          saldada_en: string | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          fecha?: string
          id?: string
          lote_id?: string | null
          moneda: string
          monto_centavos: number
          nota?: string | null
          saldada_en?: string | null
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          fecha?: string
          id?: string
          lote_id?: string | null
          moneda?: string
          monto_centavos?: number
          nota?: string | null
          saldada_en?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "deudas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "deudas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "deudas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "deudas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "deudas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_items: {
        Row: {
          cantidad: number
          costo_ananja_unitario_centavos: number | null
          costo_lote_unitario_centavos: number | null
          costo_produccion_unitario_centavos: number | null
          entrega_id: string
          id: string
          lote_id: string | null
          precio_sugerido_centavos: number | null
          producto_id: string
        }
        Insert: {
          cantidad: number
          costo_ananja_unitario_centavos?: number | null
          costo_lote_unitario_centavos?: number | null
          costo_produccion_unitario_centavos?: number | null
          entrega_id: string
          id?: string
          lote_id?: string | null
          precio_sugerido_centavos?: number | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          costo_ananja_unitario_centavos?: number | null
          costo_lote_unitario_centavos?: number | null
          costo_produccion_unitario_centavos?: number | null
          entrega_id?: string
          id?: string
          lote_id?: string | null
          precio_sugerido_centavos?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrega_items_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas_revendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "entrega_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      entregas_revendedor: {
        Row: {
          admin_id: string
          created_at: string
          fecha: string
          id: string
          nota: string | null
          tipo: string
          vendedor_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          tipo: string
          vendedor_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          tipo?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entregas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      feria_productos: {
        Row: {
          cantidad_degustacion: number
          cantidad_llevada: number
          feria_id: string
          id: string
          precio_centavos: number
          producto_id: string
        }
        Insert: {
          cantidad_degustacion?: number
          cantidad_llevada?: number
          feria_id: string
          id?: string
          precio_centavos: number
          producto_id: string
        }
        Update: {
          cantidad_degustacion?: number
          cantidad_llevada?: number
          feria_id?: string
          id?: string
          precio_centavos?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "ferias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_feria_totales"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_resultado_feria"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      ferias: {
        Row: {
          created_at: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          lugar: string | null
          nombre: string
          nota: string | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          lugar?: string | null
          nombre: string
          nota?: string | null
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          lugar?: string | null
          nombre?: string
          nota?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ferias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ferias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ferias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ferias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria_id: string
          concepto_lote: string | null
          concepto_pago: string | null
          created_at: string
          encargado_beneficiario_id: string | null
          fecha: string
          feria_id: string | null
          id: string
          imagen_path: string | null
          lote_id: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string | null
          producto_id: string | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          categoria_id: string
          concepto_lote?: string | null
          concepto_pago?: string | null
          created_at?: string
          encargado_beneficiario_id?: string | null
          fecha?: string
          feria_id?: string | null
          id?: string
          imagen_path?: string | null
          lote_id?: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota?: string | null
          producto_id?: string | null
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          categoria_id?: string
          concepto_lote?: string | null
          concepto_pago?: string | null
          created_at?: string
          encargado_beneficiario_id?: string | null
          fecha?: string
          feria_id?: string | null
          id?: string
          imagen_path?: string | null
          lote_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string | null
          producto_id?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_encargado_beneficiario_id_fkey"
            columns: ["encargado_beneficiario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "gastos_encargado_beneficiario_id_fkey"
            columns: ["encargado_beneficiario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "gastos_encargado_beneficiario_id_fkey"
            columns: ["encargado_beneficiario_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "gastos_encargado_beneficiario_id_fkey"
            columns: ["encargado_beneficiario_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "gastos_encargado_beneficiario_id_fkey"
            columns: ["encargado_beneficiario_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "ferias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_feria_totales"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "gastos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_resultado_feria"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "gastos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "gastos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "gastos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "gastos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          tipo: string
          umbral_minimo: number
          unidad: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          tipo: string
          umbral_minimo?: number
          unidad: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          umbral_minimo?: number
          unidad?: string
        }
        Relationships: []
      }
      keepalive: {
        Row: {
          id: number
          pinged_at: string
          source: string
        }
        Insert: {
          id?: never
          pinged_at?: string
          source: string
        }
        Update: {
          id?: never
          pinged_at?: string
          source?: string
        }
        Relationships: []
      }
      lote_costos: {
        Row: {
          a_pagar_centavos: number | null
          cantidad: number | null
          concepto: string
          costo_neto_centavos: number | null
          costo_unitario_centavos: number | null
          created_at: string
          descripcion: string | null
          envio_centavos: number | null
          id: string
          insumo_id: string | null
          lote_id: string
          neto_centavos: number | null
          producto_id: string | null
          se_paga: boolean
          total_centavos: number
        }
        Insert: {
          a_pagar_centavos?: number | null
          cantidad?: number | null
          concepto: string
          costo_neto_centavos?: number | null
          costo_unitario_centavos?: number | null
          created_at?: string
          descripcion?: string | null
          envio_centavos?: number | null
          id?: string
          insumo_id?: string | null
          lote_id: string
          neto_centavos?: number | null
          producto_id?: string | null
          se_paga: boolean
          total_centavos: number
        }
        Update: {
          a_pagar_centavos?: number | null
          cantidad?: number | null
          concepto?: string
          costo_neto_centavos?: number | null
          costo_unitario_centavos?: number | null
          created_at?: string
          descripcion?: string | null
          envio_centavos?: number | null
          id?: string
          insumo_id?: string | null
          lote_id?: string
          neto_centavos?: number | null
          producto_id?: string | null
          se_paga?: boolean
          total_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "lote_costos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_costos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_insumos"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lote_costos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_tanque_aceite"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lote_costos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_costos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_costos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_costos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_costos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_costos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      lote_items: {
        Row: {
          cantidad: number
          costo_ananja_redondeado_centavos: number | null
          id: string
          lote_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          costo_ananja_redondeado_centavos?: number | null
          id?: string
          lote_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          costo_ananja_redondeado_centavos?: number | null
          id?: string
          lote_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      lote_valoraciones: {
        Row: {
          aceite_centavos: number
          costo_ananja_calculado_centavos: number
          costo_ananja_centavos: number
          costo_ananja_redondeado_centavos: number | null
          costo_unitario_centavos: number
          costos_jsonb: Json
          created_at: string
          envase_centavos: number
          etiqueta_centavos: number
          ganancia_pct: number
          id: string
          lote_id: string
          mayorista_pct: number
          minorista_pct: number
          nota: string | null
          otros_centavos: number
          precio_mayorista_sugerido_centavos: number
          precio_minorista_sugerido_centavos: number
          producto_id: string
          total_centavos: number
          transporte_centavos: number
          vendedor_id: string
        }
        Insert: {
          aceite_centavos: number
          costo_ananja_calculado_centavos: number
          costo_ananja_centavos: number
          costo_ananja_redondeado_centavos?: number | null
          costo_unitario_centavos: number
          costos_jsonb: Json
          created_at?: string
          envase_centavos: number
          etiqueta_centavos: number
          ganancia_pct: number
          id?: string
          lote_id: string
          mayorista_pct: number
          minorista_pct: number
          nota?: string | null
          otros_centavos: number
          precio_mayorista_sugerido_centavos: number
          precio_minorista_sugerido_centavos: number
          producto_id: string
          total_centavos: number
          transporte_centavos: number
          vendedor_id: string
        }
        Update: {
          aceite_centavos?: number
          costo_ananja_calculado_centavos?: number
          costo_ananja_centavos?: number
          costo_ananja_redondeado_centavos?: number | null
          costo_unitario_centavos?: number
          costos_jsonb?: Json
          created_at?: string
          envase_centavos?: number
          etiqueta_centavos?: number
          ganancia_pct?: number
          id?: string
          lote_id?: string
          mayorista_pct?: number
          minorista_pct?: number
          nota?: string | null
          otros_centavos?: number
          precio_mayorista_sugerido_centavos?: number
          precio_minorista_sugerido_centavos?: number
          producto_id?: string
          total_centavos?: number
          transporte_centavos?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_valoraciones_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_valoraciones_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_valoraciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_produccion: {
        Row: {
          created_at: string
          dolar_centavos: number | null
          envase_cobrado_sin_iva: boolean
          fecha: string
          ganancia_pct: number
          id: string
          iva_pct: number
          mayorista_pct: number
          minorista_pct: number
          nota: string | null
          precio_litro_aceite_usd_centavos: number | null
          precios_incluyen_iva: boolean
          transporte_pct: number | null
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          dolar_centavos?: number | null
          envase_cobrado_sin_iva?: boolean
          fecha?: string
          ganancia_pct?: number
          id?: string
          iva_pct?: number
          mayorista_pct?: number
          minorista_pct?: number
          nota?: string | null
          precio_litro_aceite_usd_centavos?: number | null
          precios_incluyen_iva?: boolean
          transporte_pct?: number | null
          vendedor_id: string
        }
        Update: {
          created_at?: string
          dolar_centavos?: number | null
          envase_cobrado_sin_iva?: boolean
          fecha?: string
          ganancia_pct?: number
          id?: string
          iva_pct?: number
          mayorista_pct?: number
          minorista_pct?: number
          nota?: string | null
          precio_litro_aceite_usd_centavos?: number | null
          precios_incluyen_iva?: boolean
          transporte_pct?: number | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_venta: {
        Row: {
          actualizado_por: string | null
          created_at: string
          cuerpo: string
          id: string
          orden: number
          publicado: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          created_at?: string
          cuerpo?: string
          id?: string
          orden?: number
          publicado?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          created_at?: string
          cuerpo?: string
          id?: string
          orden?: number
          publicado?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materiales_venta_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "materiales_venta_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "materiales_venta_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "materiales_venta_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "materiales_venta_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_insumo: {
        Row: {
          cantidad: number
          created_at: string
          gasto_id: string | null
          id: string
          insumo_id: string
          lote_id: string | null
          nota: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          gasto_id?: string | null
          id?: string
          insumo_id: string
          lote_id?: string | null
          nota?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          gasto_id?: string | null
          id?: string
          insumo_id?: string
          lote_id?: string | null
          nota?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_insumo_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_insumos"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_tanque_aceite"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_stock: {
        Row: {
          cantidad: number
          comprobante_id: string | null
          created_at: string
          entrega_id: string | null
          feria_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          nota: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Insert: {
          cantidad: number
          comprobante_id?: string | null
          created_at?: string
          entrega_id?: string | null
          feria_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Update: {
          cantidad?: number
          comprobante_id?: string | null
          created_at?: string
          entrega_id?: string | null
          feria_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          producto_id?: string
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_comprobante"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "movimientos_stock_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas_revendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "ferias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_feria_totales"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "movimientos_stock_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_resultado_feria"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_stock_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "movimientos_stock_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "movimientos_stock_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "movimientos_stock_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "movimientos_stock_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_stock_borrados: {
        Row: {
          borrado_at: string
          borrado_por: string | null
          cantidad: number
          comprobante_id: string | null
          created_at: string
          entrega_id: string | null
          feria_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          movimiento_id: string
          nota: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Insert: {
          borrado_at?: string
          borrado_por?: string | null
          cantidad: number
          comprobante_id?: string | null
          created_at: string
          entrega_id?: string | null
          feria_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          movimiento_id: string
          nota?: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id: string
        }
        Update: {
          borrado_at?: string
          borrado_por?: string | null
          cantidad?: number
          comprobante_id?: string | null
          created_at?: string
          entrega_id?: string | null
          feria_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          movimiento_id?: string
          nota?: string | null
          producto_id?: string
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          vendedor_id?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          created_at: string
          destinatario_id: string | null
          detalle: string | null
          id: string
          referencia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Insert: {
          created_at?: string
          destinatario_id?: string | null
          detalle?: string | null
          id?: string
          referencia_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Update: {
          created_at?: string
          destinatario_id?: string | null
          detalle?: string | null
          id?: string
          referencia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "notificaciones_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_deuda: {
        Row: {
          created_at: string
          deuda_id: string
          fecha: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_caja_centavos: number
          monto_centavos: number
          nota: string | null
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          deuda_id: string
          fecha?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_caja_centavos: number
          monto_centavos: number
          nota?: string | null
          vendedor_id: string
        }
        Update: {
          created_at?: string
          deuda_id?: string
          fecha?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_caja_centavos?: number
          monto_centavos?: number
          nota?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_deuda_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "deudas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_deuda_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_aceite_lote"
            referencedColumns: ["deuda_id"]
          },
          {
            foreignKeyName: "pagos_deuda_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_deuda"
            referencedColumns: ["deuda_id"]
          },
          {
            foreignKeyName: "pagos_deuda_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "pagos_deuda_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_deuda_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "pagos_deuda_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_deuda_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_revendedor: {
        Row: {
          created_at: string
          destinatario_id: string | null
          estado: string
          fecha: string
          id: string
          imagen_path: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          motivo_rechazo: string | null
          nota: string | null
          rendicion_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          destinatario_id?: string | null
          estado?: string
          fecha: string
          id?: string
          imagen_path?: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          motivo_rechazo?: string | null
          nota?: string | null
          rendicion_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          vendedor_id: string
        }
        Update: {
          created_at?: string
          destinatario_id?: string | null
          estado?: string
          fecha?: string
          id?: string
          imagen_path?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          motivo_rechazo?: string | null
          nota?: string | null
          rendicion_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_revendedor_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_revendedor_rendicion_id_fkey"
            columns: ["rendicion_id"]
            isOneToOne: false
            referencedRelation: "rendiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_revendedor_rendicion_id_fkey"
            columns: ["rendicion_id"]
            isOneToOne: false
            referencedRelation: "v_rendiciones_ananja"
            referencedColumns: ["rendicion_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pagos_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          costo_centavos: number
          id: string
          nombre: string
          presentacion_ml: number
          umbral_minimo: number
        }
        Insert: {
          costo_centavos?: number
          id?: string
          nombre: string
          presentacion_ml: number
          umbral_minimo?: number
        }
        Update: {
          costo_centavos?: number
          id?: string
          nombre?: string
          presentacion_ml?: number
          umbral_minimo?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
        }
        Relationships: []
      }
      recetas: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_insumos"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_tanque_aceite"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      rendiciones: {
        Row: {
          admin_id: string
          created_at: string
          encargado_diferencia_id: string | null
          fecha: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota: string | null
          tenedor_id: string | null
          vendedor_id: string
          via: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          encargado_diferencia_id?: string | null
          fecha?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto_centavos: number
          nota?: string | null
          tenedor_id?: string | null
          vendedor_id: string
          via?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          encargado_diferencia_id?: string | null
          fecha?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto_centavos?: number
          nota?: string | null
          tenedor_id?: string | null
          vendedor_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "rendiciones_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_diferencia_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_diferencia_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_diferencia_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_diferencia_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_diferencia_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      revendedor_precios: {
        Row: {
          id: string
          precio_centavos: number
          producto_id: string
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          id?: string
          precio_centavos: number
          producto_id: string
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          id?: string
          precio_centavos?: number
          producto_id?: string
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revendedor_precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revendedor_precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "revendedor_precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "revendedor_precios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "revendedor_precios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "revendedor_precios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "revendedor_precios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "revendedor_precios_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_caja: {
        Row: {
          created_at: string
          destino: Database["public"]["Enums"]["medio_pago"]
          fecha: string
          id: string
          monto_centavos: number
          nota: string | null
          origen: Database["public"]["Enums"]["medio_pago"]
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          destino: Database["public"]["Enums"]["medio_pago"]
          fecha?: string
          id?: string
          monto_centavos: number
          nota?: string | null
          origen: Database["public"]["Enums"]["medio_pago"]
          vendedor_id: string
        }
        Update: {
          created_at?: string
          destino?: Database["public"]["Enums"]["medio_pago"]
          fecha?: string
          id?: string
          monto_centavos?: number
          nota?: string | null
          origen?: Database["public"]["Enums"]["medio_pago"]
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "transferencias_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "transferencias_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "transferencias_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "transferencias_caja_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          activo: boolean
          creado_en: string | null
          email: string | null
          encargado_id: string | null
          id: string
          nombre: string
          revende: boolean
          rol: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          creado_en?: string | null
          email?: string | null
          encargado_id?: string | null
          id?: string
          nombre: string
          revende?: boolean
          rol?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          creado_en?: string | null
          email?: string | null
          encargado_id?: string | null
          id?: string
          nombre?: string
          revende?: boolean
          rol?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "vendedores_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "vendedores_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "vendedores_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "vendedores_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_revendedor: {
        Row: {
          cantidad: number
          created_at: string
          entrega_item_id: string | null
          fecha: string
          grupo_id: string
          id: string
          lote_id: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          nota: string | null
          precio_costo_centavos: number
          precio_venta_centavos: number | null
          producto_id: string
          registrada_por: string | null
          vendedor_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          entrega_item_id?: string | null
          fecha?: string
          grupo_id?: string
          id?: string
          lote_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nota?: string | null
          precio_costo_centavos: number
          precio_venta_centavos?: number | null
          producto_id: string
          registrada_por?: string | null
          vendedor_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          entrega_item_id?: string | null
          fecha?: string
          grupo_id?: string
          id?: string
          lote_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nota?: string | null
          precio_costo_centavos?: number
          precio_venta_centavos?: number | null
          producto_id?: string
          registrada_por?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_revendedor_entrega_item_id_fkey"
            columns: ["entrega_item_id"]
            isOneToOne: false
            referencedRelation: "entrega_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_revendedor_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_revendedor_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_revendedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_revendedor_borradas: {
        Row: {
          borrada_at: string
          borrada_por: string | null
          cantidad: number
          created_at: string
          entrega_item_id: string | null
          fecha: string
          grupo_id: string
          id: string
          lote_id: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          nota: string | null
          precio_costo_centavos: number
          precio_venta_centavos: number | null
          producto_id: string
          registrada_por: string | null
          vendedor_id: string
          venta_id: string
        }
        Insert: {
          borrada_at?: string
          borrada_por?: string | null
          cantidad: number
          created_at: string
          entrega_item_id?: string | null
          fecha: string
          grupo_id: string
          id?: string
          lote_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nota?: string | null
          precio_costo_centavos: number
          precio_venta_centavos?: number | null
          producto_id: string
          registrada_por?: string | null
          vendedor_id: string
          venta_id: string
        }
        Update: {
          borrada_at?: string
          borrada_por?: string | null
          cantidad?: number
          created_at?: string
          entrega_item_id?: string | null
          fecha?: string
          grupo_id?: string
          id?: string
          lote_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nota?: string | null
          precio_costo_centavos?: number
          precio_venta_centavos?: number | null
          producto_id?: string
          registrada_por?: string | null
          vendedor_id?: string
          venta_id?: string
        }
        Relationships: []
      }
      versiones_precio: {
        Row: {
          created_at: string
          dolar_centavos: number
          fecha: string
          ganancia_pct: number
          id: string
          iva_pct: number
          materia_prima_usd_centavos: number
          mayorista_pct: number
          nota: string | null
          transporte_pct: number
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          dolar_centavos: number
          fecha?: string
          ganancia_pct?: number
          id?: string
          iva_pct?: number
          materia_prima_usd_centavos: number
          mayorista_pct?: number
          nota?: string | null
          transporte_pct?: number
          vendedor_id: string
        }
        Update: {
          created_at?: string
          dolar_centavos?: number
          fecha?: string
          ganancia_pct?: number
          id?: string
          iva_pct?: number
          materia_prima_usd_centavos?: number
          mayorista_pct?: number
          nota?: string | null
          transporte_pct?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "versiones_precio_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "versiones_precio_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "versiones_precio_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "versiones_precio_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "versiones_precio_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      versiones_precio_items: {
        Row: {
          envase_centavos: number
          etiqueta_centavos: number
          id: string
          precio_minorista_centavos: number
          producto_id: string
          version_id: string
        }
        Insert: {
          envase_centavos: number
          etiqueta_centavos: number
          id?: string
          precio_minorista_centavos: number
          producto_id: string
          version_id: string
        }
        Update: {
          envase_centavos?: number
          etiqueta_centavos?: number
          id?: string
          precio_minorista_centavos?: number
          producto_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "versiones_precio_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "v_precio_item"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "versiones_precio_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versiones_precio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_cobranza_lote: {
        Row: {
          costo_ananja_centavos: number | null
          en_deposito: number | null
          esperado_por_vendidas_centavos: number | null
          esperado_total_centavos: number | null
          lote_id: string | null
          perdidas: number | null
          presentacion_ml: number | null
          producidas: number | null
          producto_id: string | null
          producto_nombre: string | null
          vendidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_costo_lote: {
        Row: {
          cantidad_total: number | null
          created_at: string | null
          fecha: string | null
          gastos_asignados: number | null
          items: Json | null
          lote_id: string | null
          nota: string | null
          total_costo_centavos: number | null
          total_costos_centavos: number | null
          total_gastos_centavos: number | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lotes_produccion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_lote_desglose: {
        Row: {
          aceite_centavos: number | null
          cantidad: number | null
          costo_ananja_calculado_centavos: number | null
          costo_ananja_centavos: number | null
          costo_ananja_redondeado_centavos: number | null
          costo_unitario_centavos: number | null
          created_at: string | null
          dolar_centavos: number | null
          envase_centavos: number | null
          etiqueta_centavos: number | null
          fecha: string | null
          ganancia_pct: number | null
          lote_id: string | null
          mayorista_pct: number | null
          minorista_pct: number | null
          otros_centavos: number | null
          precio_litro_aceite_usd_centavos: number | null
          precio_mayorista_sugerido_centavos: number | null
          precio_minorista_sugerido_centavos: number | null
          presentacion_ml: number | null
          producto_id: string | null
          producto_nombre: string | null
          tiene_costos: boolean | null
          total_centavos: number | null
          transporte_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_costo_lote_item: {
        Row: {
          cantidad: number | null
          costo_unitario_centavos: number | null
          costos_compartidos_centavos: number | null
          costos_directos_centavos: number | null
          created_at: string | null
          fecha: string | null
          gastos_compartidos_centavos: number | null
          gastos_directos_centavos: number | null
          lote_id: string | null
          presentacion_ml: number | null
          producto_id: string | null
          producto_nombre: string | null
          total_costo_centavos: number | null
          total_gastos_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_costo_lote_venta: {
        Row: {
          cantidad: number | null
          cobrado_unitario_centavos: number | null
          costo_lote_incompleto: boolean | null
          costo_lote_unitario_centavos: number | null
          costo_produccion_unitario_centavos: number | null
          created_at: string | null
          fecha: string | null
          vendedor_id: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_lote_vigente: {
        Row: {
          aceite_centavos: number | null
          actualizado_en: string | null
          actualizado_por: string | null
          cantidad: number | null
          costo_ananja_calculado_centavos: number | null
          costo_ananja_centavos: number | null
          costo_ananja_original_centavos: number | null
          costo_ananja_redondeado_centavos: number | null
          costo_unitario_centavos: number | null
          costo_unitario_original_centavos: number | null
          created_at: string | null
          dolar_centavos: number | null
          envase_centavos: number | null
          etiqueta_centavos: number | null
          fecha: string | null
          ganancia_pct: number | null
          lote_id: string | null
          mayorista_pct: number | null
          minorista_pct: number | null
          otros_centavos: number | null
          precio_litro_aceite_usd_centavos: number | null
          precio_mayorista_sugerido_centavos: number | null
          precio_minorista_sugerido_centavos: number | null
          presentacion_ml: number | null
          producto_id: string | null
          producto_nombre: string | null
          tiene_costos: boolean | null
          total_centavos: number | null
          transporte_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "lote_valoraciones_vendedor_id_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_producto: {
        Row: {
          costo_unitario_promedio_3_lotes_centavos: number | null
          costo_unitario_ultimo_lote_centavos: number | null
          lotes_considerados: number | null
          nombre: string | null
          presentacion_ml: number | null
          producto_id: string | null
          ultimo_lote_fecha: string | null
          ultimo_lote_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["ultimo_lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["ultimo_lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["ultimo_lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
        ]
      }
      v_cuenta_ananja: {
        Row: {
          banco_centavos: number | null
          mercado_pago_centavos: number | null
          total_centavos: number | null
        }
        Relationships: []
      }
      v_deuda_aceite_lote: {
        Row: {
          debe_usd_centavos: number | null
          deuda_id: string | null
          fecha: string | null
          litros: number | null
          lote_id: string | null
          pagado_usd_centavos: number | null
          saldada_en: string | null
          saldo_usd_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "deudas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
        ]
      }
      v_deuda_cliente: {
        Row: {
          cantidad_ventas_pendientes: number | null
          cliente_id: string | null
          cobrado_centavos: number | null
          deuda_centavos: number | null
          nombre: string | null
          vendido_centavos: number | null
        }
        Relationships: []
      }
      v_deuda_encargados: {
        Row: {
          activo: boolean | null
          devengado_centavos: number | null
          encargado_id: string | null
          nombre: string | null
          pagado_centavos: number | null
          pendiente_desde: string | null
          saldo_centavos: number | null
        }
        Relationships: []
      }
      v_deuda_vendedor: {
        Row: {
          costo_vendido_centavos: number | null
          entregado_centavos: number | null
          nombre: string | null
          saldo_centavos: number | null
          vendedor_id: string | null
        }
        Insert: {
          costo_vendido_centavos?: never
          entregado_centavos?: never
          nombre?: string | null
          saldo_centavos?: never
          vendedor_id?: string | null
        }
        Update: {
          costo_vendido_centavos?: never
          entregado_centavos?: never
          nombre?: string | null
          saldo_centavos?: never
          vendedor_id?: string | null
        }
        Relationships: []
      }
      v_diferencia_encargado: {
        Row: {
          devengado_centavos: number | null
          encargado_id: string | null
          fecha: string | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_encargado_diferencia_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_diferencia_pendiente: {
        Row: {
          unidades_costo_incompleto: number | null
          vendedor_id: string | null
          ventas_costo_incompleto: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "ventas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_feria_stock: {
        Row: {
          cantidad_degustacion: number | null
          cantidad_llevada: number | null
          cantidad_restante: number | null
          cantidad_vendida: number | null
          feria_id: string | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "ferias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_feria_totales"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "feria_productos_feria_id_fkey"
            columns: ["feria_id"]
            isOneToOne: false
            referencedRelation: "v_resultado_feria"
            referencedColumns: ["feria_id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "feria_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_feria_totales: {
        Row: {
          cantidad_ventas: number | null
          feria_id: string | null
          gastos_total_centavos: number | null
          neto_centavos: number | null
          ventas_banco_centavos: number | null
          ventas_efectivo_centavos: number | null
          ventas_mercado_pago_centavos: number | null
          ventas_total_centavos: number | null
        }
        Relationships: []
      }
      v_lote_costos_completos: {
        Row: {
          completo: boolean | null
          lote_id: string | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_margen_ventas: {
        Row: {
          cantidad: number | null
          costo_ananja_unitario_centavos: number | null
          costo_estimado: boolean | null
          costo_produccion_unitario_centavos: number | null
          documento_id: string | null
          fecha: string | null
          feria_id: string | null
          ingreso_ananja_centavos: number | null
          lote_id: string | null
          margen_ananja_centavos: number | null
          margen_encargado_centavos: number | null
          margen_vendedor_centavos: number | null
          origen: string | null
          precio_unitario_venta_centavos: number | null
          producto_id: string | null
          vendedor_id: string | null
        }
        Relationships: []
      }
      v_perdidas_lote: {
        Row: {
          costo_total_centavos: number | null
          costo_unitario_centavos: number | null
          lote_id: string | null
          motivo: string | null
          producto_id: string | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_plata_en_manos: {
        Row: {
          ajustes_centavos: number | null
          depositos_centavos: number | null
          gastos_centavos: number | null
          nombre: string | null
          pagos_deuda_centavos: number | null
          rendiciones_centavos: number | null
          rol: string | null
          tenedor_id: string | null
          total_centavos: number | null
          transferencias_centavos: number | null
          ventas_cobros_centavos: number | null
        }
        Insert: {
          ajustes_centavos?: never
          depositos_centavos?: never
          gastos_centavos?: never
          nombre?: string | null
          pagos_deuda_centavos?: never
          rendiciones_centavos?: never
          rol?: string | null
          tenedor_id?: string | null
          total_centavos?: never
          transferencias_centavos?: never
          ventas_cobros_centavos?: never
        }
        Update: {
          ajustes_centavos?: never
          depositos_centavos?: never
          gastos_centavos?: never
          nombre?: string | null
          pagos_deuda_centavos?: never
          rendiciones_centavos?: never
          rol?: string | null
          tenedor_id?: string | null
          total_centavos?: never
          transferencias_centavos?: never
          ventas_cobros_centavos?: never
        }
        Relationships: []
      }
      v_precio_item: {
        Row: {
          con_transporte_centavos: number | null
          costo_centavos: number | null
          dolar_centavos: number | null
          envase_centavos: number | null
          etiqueta_centavos: number | null
          fecha: string | null
          ganancia_centavos: number | null
          iva_centavos: number | null
          materia_prima_centavos: number | null
          precio_base_centavos: number | null
          precio_mayorista_centavos: number | null
          precio_minorista_centavos: number | null
          presentacion_ml: number | null
          producto_id: string | null
          producto_nombre: string | null
          subtotal_centavos: number | null
          transporte_centavos: number | null
          version_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "versiones_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_productos_publicos: {
        Row: {
          id: string | null
          nombre: string | null
          presentacion_ml: number | null
        }
        Relationships: []
      }
      v_rendiciones_ananja: {
        Row: {
          created_at: string | null
          monto_ananja_centavos: number | null
          monto_centavos: number | null
          rendicion_id: string | null
          tenedor_id: string | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_tenedor_id_fkey"
            columns: ["tenedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "rendiciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_resultado_feria: {
        Row: {
          cantidad_ventas: number | null
          feria_id: string | null
          gastos_produccion_centavos: number | null
          gastos_total_centavos: number | null
          margen_ananja_centavos: number | null
          neto_ananja_centavos: number | null
          neto_centavos: number | null
          unidades_sin_costo: number | null
          ventas_banco_centavos: number | null
          ventas_efectivo_centavos: number | null
          ventas_mercado_pago_centavos: number | null
          ventas_total_centavos: number | null
        }
        Relationships: []
      }
      v_resumen_revendedor: {
        Row: {
          cantidad_ventas: number | null
          costo_centavos: number | null
          debe_centavos: number | null
          ganancia_centavos: number | null
          nombre: string | null
          rendido_centavos: number | null
          unidades_sin_precio: number | null
          vendedor_id: string | null
          vendido_centavos: number | null
        }
        Relationships: []
      }
      v_saldo_comprobante: {
        Row: {
          cobrado_total_centavos: number | null
          comprobante_id: string | null
          deuda_centavos: number | null
          monto_centavos: number | null
        }
        Insert: {
          cobrado_total_centavos?: never
          comprobante_id?: string | null
          deuda_centavos?: never
          monto_centavos?: number | null
        }
        Update: {
          cobrado_total_centavos?: never
          comprobante_id?: string | null
          deuda_centavos?: never
          monto_centavos?: number | null
        }
        Relationships: []
      }
      v_saldo_deuda: {
        Row: {
          created_at: string | null
          descripcion: string | null
          deuda_id: string | null
          fecha: string | null
          moneda: string | null
          monto_centavos: number | null
          nota: string | null
          pagado_centavos: number | null
          restante_centavos: number | null
          saldada_en: string | null
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          deuda_id?: string | null
          fecha?: string | null
          moneda?: string | null
          monto_centavos?: number | null
          nota?: string | null
          pagado_centavos?: never
          restante_centavos?: never
          saldada_en?: string | null
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          deuda_id?: string | null
          fecha?: string | null
          moneda?: string | null
          monto_centavos?: number | null
          nota?: string | null
          pagado_centavos?: never
          restante_centavos?: never
          saldada_en?: string | null
        }
        Relationships: []
      }
      v_saldo_lote: {
        Row: {
          a_pagar_centavos: number | null
          fecha: string | null
          lote_id: string | null
          pagado_centavos: number | null
          saldo_centavos: number | null
        }
        Relationships: []
      }
      v_saldo_lote_concepto: {
        Row: {
          a_pagar_centavos: number | null
          concepto: string | null
          lote_id: string | null
          pagado_centavos: number | null
          producto_id: string | null
          saldo_centavos: number | null
        }
        Relationships: []
      }
      v_saldos_caja: {
        Row: {
          medio_pago: string | null
          saldo_centavos: number | null
        }
        Relationships: []
      }
      v_stock_actual: {
        Row: {
          bajo_umbral: boolean | null
          nombre: string | null
          presentacion_ml: number | null
          producto_id: string | null
          stock: number | null
          umbral_minimo: number | null
        }
        Relationships: []
      }
      v_stock_insumos: {
        Row: {
          bajo_umbral: boolean | null
          insumo_id: string | null
          nombre: string | null
          stock: number | null
          tipo: string | null
          umbral_minimo: number | null
          unidad: string | null
        }
        Relationships: []
      }
      v_stock_por_lote: {
        Row: {
          fecha: string | null
          lote_id: string | null
          producido: number | null
          producto_id: string | null
          quedan: number | null
          salidas_asignadas: number | null
          salidas_sin_asignar_atribuidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_costo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lote_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_stock_revendedor: {
        Row: {
          en_poder: number | null
          producto_id: string | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tanque_aceite: {
        Row: {
          costo_promedio_centavos_por_litro: number | null
          insumo_id: string | null
          litros_comprados: number | null
          litros_consumidos: number | null
          litros_restantes: number | null
          nombre: string | null
          valor_restante_centavos: number | null
        }
        Relationships: []
      }
      v_valor_stock_revendedor: {
        Row: {
          en_poder: number | null
          producto_id: string | null
          valor_en_poder_ananja_centavos: number | null
          valor_en_poder_centavos: number | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entrega_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_encargados"
            referencedColumns: ["encargado_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_deuda_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_plata_en_manos"
            referencedColumns: ["tenedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_revendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "entregas_revendedor_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_comprobante: {
        Args: {
          p_cliente_id?: string
          p_cobrado_centavos?: number
          p_comprobante_id: string
          p_estado_ocr?: Database["public"]["Enums"]["estado_ocr"]
          p_fecha: string
          p_feria_id?: string
          p_imagen_path: string
          p_items?: Json
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
          p_ocr_monto_centavos?: number
          p_permitir_negativo?: boolean
        }
        Returns: Json
      }
      actualizar_costo_lote_vigente: {
        Args: { p_costos: Json; p_lote_id: string; p_nota?: string }
        Returns: Json
      }
      adjuntar_comprobante_gasto: {
        Args: { p_gasto_id: string; p_imagen_path: string }
        Returns: Json
      }
      ajustar_insumo: {
        Args: { p_cantidad: number; p_insumo_id: string; p_nota: string }
        Returns: Json
      }
      aplicar_costos_lote: {
        Args: { p_costos: Json; p_lote_id: string }
        Returns: undefined
      }
      asignar_encargado_revendedor: {
        Args: { p_encargado_id?: string; p_vendedor_id: string }
        Returns: Json
      }
      asignar_rol_revendedor: {
        Args: { p_rol: string; p_vendedor_id: string }
        Returns: Json
      }
      buscar_cargas_parecidas: {
        Args: {
          p_clave?: string
          p_entrega: Json
          p_pago: Json
          p_vendedor_id: string
          p_ventas: Json
        }
        Returns: Json
      }
      calcular_costos_lote: {
        Args: { p_costos: Json; p_lote_id: string }
        Returns: {
          a_pagar_centavos: number
          cantidad: number
          concepto: string
          costo_neto_centavos: number
          costo_unitario_centavos: number
          descripcion: string
          envio_centavos: number
          insumo_id: string
          neto_centavos: number
          producto_id: string
          se_paga: boolean
          total_centavos: number
        }[]
      }
      confirmar_deposito_informado: {
        Args: { p_deposito_informado_id: string }
        Returns: Json
      }
      confirmar_pago_revendedor: { Args: { p_pago_id: string }; Returns: Json }
      crear_ajuste_caja: {
        Args: {
          p_fecha?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota: string
        }
        Returns: Json
      }
      crear_comprobante: {
        Args: {
          p_cliente_id?: string
          p_cobrado_centavos?: number
          p_estado_ocr?: Database["public"]["Enums"]["estado_ocr"]
          p_fecha: string
          p_feria_id?: string
          p_imagen_path: string
          p_items?: Json
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
          p_ocr_monto_centavos?: number
          p_permitir_negativo?: boolean
        }
        Returns: Json
      }
      crear_feria: {
        Args: {
          p_fecha_inicio: string
          p_lugar: string
          p_nombre: string
          p_nota: string
          p_permitir_negativo?: boolean
          p_productos: Json
        }
        Returns: Json
      }
      crear_gasto: {
        Args: {
          p_categoria_id: string
          p_fecha: string
          p_feria_id?: string
          p_imagen_path?: string
          p_lote_id?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
          p_producto_id?: string
        }
        Returns: Json
      }
      crear_insumo: {
        Args: {
          p_nombre: string
          p_tipo: string
          p_umbral_minimo?: number
          p_unidad: string
        }
        Returns: Json
      }
      crear_lote: {
        Args: {
          p_costos?: Json
          p_fecha: string
          p_items?: Json
          p_nota?: string
          p_permitir_negativo?: boolean
        }
        Returns: Json
      }
      crear_version_precio: {
        Args: {
          p_dolar_centavos: number
          p_fecha: string
          p_ganancia_pct?: number
          p_items?: Json
          p_iva_pct?: number
          p_materia_prima_usd_centavos: number
          p_mayorista_pct?: number
          p_nota?: string
          p_transporte_pct?: number
        }
        Returns: Json
      }
      editar_ajuste_caja: {
        Args: { p_ajuste_id: string; p_fecha: string; p_nota: string }
        Returns: Json
      }
      eliminar_ajuste_caja: { Args: { p_ajuste_id: string }; Returns: Json }
      eliminar_cobro: { Args: { p_cobro_id: string }; Returns: Json }
      eliminar_deposito_cuenta: { Args: { p_deposito_id: string }; Returns: Json }
      eliminar_movimiento_stock: { Args: { p_movimiento_id: string }; Returns: Json }
      eliminar_pago_deuda: { Args: { p_pago_id: string }; Returns: Json }
      eliminar_venta_revendedor: { Args: { p_venta_id: string }; Returns: Json }
      es_admin: { Args: never; Returns: boolean }
      es_coordinador: { Args: never; Returns: boolean }
      es_coordinador_de: { Args: { p_vendedor_id: string }; Returns: boolean }
      es_revendedor: { Args: never; Returns: boolean }
      es_vendedor: { Args: never; Returns: boolean }
      fijar_costos_lote: {
        Args: { p_costos: Json; p_lote_id: string }
        Returns: Json
      }
      fijar_destino_efectivo: {
        Args: { p_medio_pago: Database["public"]["Enums"]["medio_pago"] }
        Returns: Json
      }
      fijar_espacio_revendedor: {
        Args: { p_habilitar: boolean; p_vendedor_id: string }
        Returns: Json
      }
      fijar_precio_revendedor: {
        Args: {
          p_precio_centavos: number
          p_producto_id: string
          p_vendedor_id: string
        }
        Returns: Json
      }
      fijar_precio_venta_revendedor: {
        Args: {
          p_grupo_id: string
          p_medio_pago?: Database["public"]["Enums"]["medio_pago"]
          p_precio_venta_centavos: number
        }
        Returns: Json
      }
      guardar_proveedor: { Args: { p_nombre: string }; Returns: undefined }
      informar_deposito_cuenta: {
        Args: {
          p_fecha?: string
          p_imagen_path?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      informar_pago_revendedor: {
        Args: {
          p_fecha: string
          p_imagen_path?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      insertar_venta_revendedor: {
        Args: {
          p_cantidad: number
          p_fecha: string
          p_grupo_id: string
          p_lote_id?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_nota: string
          p_precio_venta_centavos: number
          p_producto_id: string
          p_registrada_por: string
          p_vendedor_id: string
        }
        Returns: Json
      }
      lote_costos_completos: {
        Args: { p_lote_id: string; p_producto_id: string }
        Returns: boolean
      }
      lotes_disponibles_coordinador: {
        Args: { p_producto_id: string }
        Returns: {
          fecha: string
          lote_id: string
          quedan: number
        }[]
      }
      mi_encargado_revendedor: {
        Args: never
        Returns: {
          id: string
          nombre: string
        }[]
      }
      mi_vendedor_id: { Args: never; Returns: string }
      productos_publicos: {
        Args: never
        Returns: {
          id: string
          nombre: string
          presentacion_ml: number
        }[]
      }
      puede_revender: { Args: never; Returns: boolean }
      quitar_comprobante_gasto: { Args: { p_gasto_id: string }; Returns: Json }
      reabrir_feria: { Args: { p_feria_id: string }; Returns: Json }
      rechazar_deposito_informado: {
        Args: { p_deposito_informado_id: string; p_motivo: string }
        Returns: Json
      }
      rechazar_pago_revendedor: {
        Args: { p_motivo: string; p_pago_id: string }
        Returns: Json
      }
      rechazar_pendiente: { Args: { p_vendedor_id: string }; Returns: Json }
      registrar_carga_revendedor: {
        Args: {
          p_clave: string
          p_entrega: Json
          p_pago: Json
          p_vendedor_id: string
          p_ventas: Json
        }
        Returns: Json
      }
      registrar_cobro: {
        Args: {
          p_comprobante_id: string
          p_fecha: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      registrar_compra_insumo: {
        Args: {
          p_cantidad: number
          p_fecha: string
          p_imagen_path?: string
          p_insumo_id: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      registrar_compra_insumos_factura: {
        Args: {
          p_envio_centavos?: number
          p_fecha: string
          p_imagen_path?: string
          p_iva_pct?: number
          p_lineas: Json
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_nota?: string
          p_precios_sin_iva?: boolean
          p_total_esperado_centavos?: number
        }
        Returns: Json
      }
      registrar_deposito_cuenta: {
        Args: {
          p_fecha: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
          p_permitir_negativo?: boolean
          p_tenedor_id: string
        }
        Returns: Json
      }
      registrar_entrega_revendedor: {
        Args: {
          p_fecha: string
          p_items?: Json
          p_nota?: string
          p_permitir_negativo?: boolean
          p_tipo: string
          p_vendedor_id: string
        }
        Returns: Json
      }
      registrar_pago_deuda: {
        Args: {
          p_deuda_id: string
          p_fecha: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_caja_centavos?: number
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      registrar_pago_diferencia_encargado: {
        Args: {
          p_encargado_id: string
          p_fecha: string
          p_forzar?: boolean
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
        }
        Returns: Json
      }
      registrar_pago_lote: {
        Args: {
          p_fecha: string
          p_lote_id: string
          p_nota?: string
          p_pagos: Json
        }
        Returns: Json
      }
      registrar_rendicion: {
        Args: {
          p_fecha: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_monto_centavos: number
          p_nota?: string
          p_vendedor_id: string
          p_via?: string
        }
        Returns: Json
      }
      registrar_transferencia_caja: {
        Args: {
          p_destino: Database["public"]["Enums"]["medio_pago"]
          p_fecha: string
          p_monto_centavos: number
          p_nota?: string
          p_origen: Database["public"]["Enums"]["medio_pago"]
          p_permitir_negativo?: boolean
        }
        Returns: Json
      }
      registrar_venta_revendedor: {
        Args: {
          p_cantidad: number
          p_fecha: string
          p_lote_id?: string
          p_medio_pago: Database["public"]["Enums"]["medio_pago"]
          p_nota?: string
          p_precio_venta_centavos: number
          p_producto_id: string
        }
        Returns: Json
      }
      registrar_venta_revendedor_admin: {
        Args: {
          p_cantidad: number
          p_fecha: string
          p_grupo_id?: string
          p_lote_id?: string
          p_medio_pago?: Database["public"]["Enums"]["medio_pago"]
          p_nota?: string
          p_precio_venta_centavos?: number
          p_producto_id: string
          p_vendedor_id: string
        }
        Returns: Json
      }
      repartir_resto_mayor: {
        Args: { p_pesos: number[]; p_total: number }
        Returns: number[]
      }
      sincronizar_deuda_aceite_lote: {
        Args: { p_lote_id: string }
        Returns: undefined
      }
      stock_revendedor_por_entrega: {
        Args: { p_producto_id: string; p_vendedor_id: string }
        Returns: {
          costo_ananja_unitario_centavos: number
          entrega_item_id: string
          fecha: string
          lote_id: string
          orden: number
          precio_sugerido_centavos: number
          quedan: number
        }[]
      }
    }
    Enums: {
      estado_ocr: "no_intentado" | "propuesto" | "corregido" | "fallido"
      medio_pago: "banco" | "mercado_pago" | "efectivo"
      tipo_movimiento: "ingreso" | "egreso"
      tipo_notificacion:
        | "stock_bajo"
        | "gasto_nuevo"
        | "pago_revendedor"
        | "deposito_informado"
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
      estado_ocr: ["no_intentado", "propuesto", "corregido", "fallido"],
      medio_pago: ["banco", "mercado_pago", "efectivo"],
      tipo_movimiento: ["ingreso", "egreso"],
      tipo_notificacion: [
        "stock_bajo",
        "gasto_nuevo",
        "pago_revendedor",
        "deposito_informado",
      ],
    },
  },
} as const

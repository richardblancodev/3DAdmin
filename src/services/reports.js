import { supabase } from "../lib/supabase";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

async function getAllRows(client, table, select) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error)
      throw new Error(`No se pudo cargar el informe de ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function getAdministrativeReportData() {
  const client = requireSupabase();
  const [
    orders,
    payments,
    refunds,
    productReturns,
    inventoryMovements,
    filamentRolls,
    hardwareItems,
    customers,
    suppliers,
    products,
    printers,
    settingsResult,
  ] = await Promise.all([
    getAllRows(
      client,
      "orders",
      "id, customer_id, product_id, filament_roll_id, printer_id, customer_name, product_name, quantity, status, due_date, material_cost, energy_cost, machine_wear_cost, labor_cost, filament_grams_per_unit, print_hours_per_unit, post_processing_hours_per_unit, suggested_price, sale_price, sale_subtotal, vat_rate, vat_amount, fiscal_entity_type, is_vat_responsible, fiscal_tax_regime, fiscal_business_name, fiscal_tax_id, document_prefix, currency_code, created_at",
    ),
    getAllRows(
      client,
      "order_payments",
      "id, order_id, amount, payment_method, notes, created_at",
    ),
    getAllRows(
      client,
      "order_refunds",
      "id, order_id, payment_id, product_return_id, amount, refund_method, notes, created_at",
    ),
    getAllRows(
      client,
      "order_product_returns",
      "id, order_id, quantity, item_condition, notes, created_at",
    ),
    getAllRows(
      client,
      "inventory_movements",
      "id, filament_roll_id, hardware_item_id, movement_type, quantity, unit, purchase_total, purchase_vat_amount, purchase_vat_treatment, notes, created_at, filament_rolls(brand, material, color), hardware_items(name)",
    ),
    getAllRows(
      client,
      "filament_rolls",
      "id, brand, material, color, initial_weight_g, remaining_weight_g, cost, status, supplier_id, created_at",
    ),
    getAllRows(
      client,
      "hardware_items",
      "id, name, category, quantity, unit, minimum_quantity, cost, supplier_id, created_at",
    ),
    getAllRows(
      client,
      "customers",
      "id, name, email, phone, privacy_consent_status, privacy_consent_at, privacy_consent_method, privacy_notice_version, created_at",
    ),
    getAllRows(
      client,
      "suppliers",
      "id, name, email, phone, notes, created_at",
    ),
    getAllRows(
      client,
      "products",
      "id, name, category, material, grams_per_unit, hours_per_unit, post_processing_hours_per_unit, default_price, vat_rate, created_at",
    ),
    getAllRows(
      client,
      "printers",
      "id, name, model, power_w, wear_per_hour, status, created_at",
    ),
    client
      .from("workshop_settings")
      .select(
        "energy_rate_per_kwh, printer_power_w, machine_wear_per_hour, labor_rate_per_hour, default_margin_percent, currency_code, entity_type, is_vat_responsible, default_vat_rate, tax_regime, invoice_prefix, business_name, tax_id",
      )
      .maybeSingle(),
  ]);
  if (settingsResult.error)
    throw new Error(
      `No se pudo cargar el perfil para los informes: ${settingsResult.error.message}`,
    );

  return {
    orders,
    payments,
    refunds,
    productReturns,
    inventoryMovements: inventoryMovements.map((movement) => {
      const filament = Array.isArray(movement.filament_rolls)
        ? movement.filament_rolls[0]
        : movement.filament_rolls;
      const hardware = Array.isArray(movement.hardware_items)
        ? movement.hardware_items[0]
        : movement.hardware_items;
      return {
        ...movement,
        item_name: filament
          ? `${filament.brand} · ${filament.material} · ${filament.color}`
          : (hardware?.name ?? "Artículo eliminado"),
      };
    }),
    filamentRolls,
    hardwareItems,
    customers,
    suppliers,
    products,
    printers,
    settings: settingsResult.data,
  };
}

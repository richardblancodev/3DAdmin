import { supabase } from "../lib/supabase";
function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
export async function getHardwareItems() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("hardware_items")
    .select(
      "id, name, category, quantity, unit, minimum_quantity, cost, notes, supplier_id",
    )
    .order("name");
  if (error)
    throw new Error(
      `No se pudo cargar el inventario de accesorios: ${error.message}`,
    );
  return data;
}
export async function createHardwareItem(input) {
  const client = requireSupabase();
  const { data: id, error } = await client.rpc("create_hardware_item", {
    p_name: input.name,
    p_category: input.category,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_minimum_quantity: input.minimum_quantity,
    p_cost: input.cost,
    p_notes: input.notes || null,
    p_supplier_id: input.supplier_id,
    p_purchase_total: input.purchase_total,
    p_purchase_vat_amount: input.purchase_vat_amount,
    p_purchase_vat_treatment: input.purchase_vat_treatment,
  });
  if (error)
    throw new Error(`No se pudo guardar el artículo: ${error.message}`);
  return { ...input, id };
}
export async function updateHardwareItem(id, input) {
  const { error } = await requireSupabase().rpc("update_hardware_item", {
    p_item_id: id,
    p_name: input.name,
    p_category: input.category,
    p_minimum_quantity: input.minimum_quantity,
    p_cost: input.cost,
    p_notes: input.notes || null,
    p_supplier_id: input.supplier_id,
  });
  if (error)
    throw new Error(`No se pudo actualizar el artículo: ${error.message}`);
}
export async function recordInventoryMovement(input) {
  const client = requireSupabase();
  const { error } = await client.rpc("record_inventory_movement", {
    p_filament_roll_id: input.filamentRollId,
    p_hardware_item_id: input.hardwareItemId,
    p_movement_type: input.type,
    p_quantity: input.quantity,
    p_purchase_total: input.purchaseTotal ?? 0,
    p_purchase_vat_amount: input.purchaseVatAmount ?? 0,
    p_purchase_vat_treatment: input.purchaseVatTreatment ?? "included_in_cost",
    p_notes: input.notes || null,
  });
  if (error)
    throw new Error(`No se pudo registrar el movimiento: ${error.message}`);
}
export async function getInventoryMovements() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("inventory_movements")
    .select(
      "id, movement_type, quantity, unit, purchase_total, purchase_vat_amount, purchase_vat_treatment, notes, created_at, filament_rolls(brand, material, color), hardware_items(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    throw new Error(
      `No se pudo cargar el historial de inventario: ${error.message}`,
    );
  return data.map((movement) => {
    const filament = Array.isArray(movement.filament_rolls)
      ? movement.filament_rolls[0]
      : movement.filament_rolls;
    const hardware = Array.isArray(movement.hardware_items)
      ? movement.hardware_items[0]
      : movement.hardware_items;
    const itemName = filament
      ? `${filament.brand} · ${filament.material} · ${filament.color}`
      : (hardware?.name ?? "Artículo eliminado");
    return { ...movement, item_name: itemName };
  });
}

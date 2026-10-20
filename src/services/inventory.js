import { supabase } from "../lib/supabase";
export async function getFilamentRolls() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase
    .from("filament_rolls")
    .select(
      "id, brand, material, color, initial_weight_g, remaining_weight_g, cost, supplier_id, created_at",
    )
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(`No se pudo cargar el inventario: ${error.message}`);
  return data;
}
export async function createFilamentRoll(input) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("create_filament_roll", {
    p_brand: input.brand,
    p_material: input.material,
    p_color: input.color,
    p_initial_weight_g: input.initial_weight_g,
    p_cost: input.cost,
    p_supplier_id: input.supplier_id,
    p_purchase_total: input.purchase_total,
    p_purchase_vat_amount: input.purchase_vat_amount,
    p_purchase_vat_treatment: input.purchase_vat_treatment,
  });
  if (error) throw new Error(`No se pudo guardar la bobina: ${error.message}`);
}
export async function updateFilamentRoll(id, input) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.rpc("update_filament_roll", {
    p_roll_id: id,
    p_brand: input.brand,
    p_material: input.material,
    p_color: input.color,
    p_cost: input.cost,
    p_supplier_id: input.supplier_id,
  });
  if (error)
    throw new Error(`No se pudo actualizar la bobina: ${error.message}`);
}

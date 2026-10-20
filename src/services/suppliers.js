import { supabase } from "../lib/supabase";
function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
export async function getSuppliers() {
  const { data, error } = await requireSupabase()
    .from("suppliers")
    .select("id, name, email, phone, notes")
    .order("name");
  if (error)
    throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);
  return data;
}
export async function saveSupplier(input, id) {
  const client = requireSupabase();
  const record = {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
  };
  const { error } = id
    ? await client.from("suppliers").update(record).eq("id", id)
    : await client.from("suppliers").insert(record);
  if (error)
    throw new Error(`No se pudo guardar el proveedor: ${error.message}`);
}
export async function deleteSupplier(id) {
  const { error } = await requireSupabase()
    .from("suppliers")
    .delete()
    .eq("id", id);
  if (error)
    throw new Error(
      `No se pudo eliminar el proveedor. Desvincúlalo de bobinas y artículos primero. Detalle: ${error.message}`,
    );
}

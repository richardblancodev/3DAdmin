import { supabase } from "../lib/supabase";
import { defaultWorkshopSettings } from "../utils/business";
function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
export async function getWorkshopSettings() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workshop_settings")
    .select(
      "energy_rate_per_kwh, printer_power_w, machine_wear_per_hour, labor_rate_per_hour, default_margin_percent, currency_code, entity_type, is_vat_responsible, default_vat_rate, tax_regime, invoice_prefix, business_name, tax_id",
    )
    .maybeSingle();
  if (error)
    throw new Error(
      `No se pudieron cargar los parámetros de costos: ${error.message}`,
    );
  return data ?? defaultWorkshopSettings;
}
export async function saveWorkshopSettings(settings) {
  const client = requireSupabase();
  const { error } = await client.from("workshop_settings").upsert(settings);
  if (error)
    throw new Error(
      `No se pudieron guardar los parámetros de costos: ${error.message}`,
    );
}
export async function getCustomers() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("customers")
    .select(
      "id, name, email, phone, privacy_consent_status, privacy_consent_at, privacy_consent_method, privacy_notice_version",
    )
    .order("name");
  if (error)
    throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
  return data;
}
export async function createCustomer(input) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("customers")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      privacy_consent_status: "granted",
      privacy_consent_method: input.privacy_consent_method,
      privacy_notice_version: "1.0",
    })
    .select(
      "id, name, email, phone, privacy_consent_status, privacy_consent_at, privacy_consent_method, privacy_notice_version",
    )
    .single();
  if (error) throw new Error(`No se pudo guardar el cliente: ${error.message}`);
  return data;
}
export async function updateCustomer(id, input) {
  const client = requireSupabase();
  const { error } = await client
    .from("customers")
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      privacy_consent_status: "granted",
      privacy_consent_method: input.privacy_consent_method,
      privacy_notice_version: "1.0",
    })
    .eq("id", id);
  if (error)
    throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
}
export async function deleteCustomer(id) {
  const client = requireSupabase();
  const { error } = await client.from("customers").delete().eq("id", id);
  if (error)
    throw new Error(
      `No se pudo eliminar el cliente. Si tiene pedidos asociados, primero conserva o reasigna esos pedidos. Detalle: ${error.message}`,
    );
}
export async function getWorkOrders() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("orders")
    .select(
      "id, customer_id, product_id, filament_roll_id, printer_id, customer_name, product_name, quantity, status, due_date, material_cost, energy_cost, machine_wear_cost, labor_cost, filament_grams_per_unit, print_hours_per_unit, post_processing_hours_per_unit, suggested_price, sale_price, sale_subtotal, vat_rate, vat_amount, fiscal_entity_type, is_vat_responsible, fiscal_tax_regime, fiscal_business_name, fiscal_tax_id, document_prefix, currency_code, created_at",
    )
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);
  return data;
}
export async function createWorkOrder(input) {
  const client = requireSupabase();
  const { error } = await client.from("orders").insert(input);
  if (error) throw new Error(`No se pudo crear el pedido: ${error.message}`);
}
export async function updateWorkOrderStatus(id, status) {
  const client = requireSupabase();
  const { error } = await client.rpc("transition_order_status", {
    p_order_id: id,
    p_status: status,
  });
  if (error)
    throw new Error(
      `No se pudo actualizar el estado del pedido: ${error.message}`,
    );
}
export async function cancelWorkOrder(id, reason, recoveredFilamentGrams) {
  const client = requireSupabase();
  const { error } = await client.rpc("cancel_work_order", {
    p_order_id: id,
    p_reason: reason || null,
    p_recovered_filament_g: recoveredFilamentGrams,
  });
  if (error) throw new Error(`No se pudo cancelar el pedido: ${error.message}`);
}
export async function updatePrinter(id, input) {
  const client = requireSupabase();
  const { error } = await client.from("printers").update(input).eq("id", id);
  if (error)
    throw new Error(`No se pudo actualizar la impresora: ${error.message}`);
}
export async function getPrinters() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("printers")
    .select("id, name, model, power_w, wear_per_hour, status, notes")
    .order("name");
  if (error)
    throw new Error(`No se pudieron cargar las impresoras: ${error.message}`);
  return data;
}
export async function createPrinter(input) {
  const client = requireSupabase();
  const { error } = await client.from("printers").insert(input);
  if (error)
    throw new Error(`No se pudo guardar la impresora: ${error.message}`);
}
export async function updatePrinterStatus(id, status) {
  const client = requireSupabase();
  const { error } = await client
    .from("printers")
    .update({ status })
    .eq("id", id);
  if (error)
    throw new Error(`No se pudo actualizar la impresora: ${error.message}`);
}
export async function getProducts() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("products")
    .select(
      "id, name, category, description, material, grams_per_unit, hours_per_unit, post_processing_hours_per_unit, default_price, vat_rate",
    )
    .order("name");
  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  return data;
}
export async function createProduct(input) {
  const client = requireSupabase();
  const { error } = await client.from("products").insert(input);
  if (error)
    throw new Error(`No se pudo guardar el producto: ${error.message}`);
}
export async function updateProduct(id, input) {
  const client = requireSupabase();
  const { error } = await client.from("products").update(input).eq("id", id);
  if (error)
    throw new Error(`No se pudo actualizar el producto: ${error.message}`);
}
export async function deleteProduct(id) {
  const client = requireSupabase();
  const { error } = await client.from("products").delete().eq("id", id);
  if (error)
    throw new Error(`No se pudo eliminar el producto: ${error.message}`);
}

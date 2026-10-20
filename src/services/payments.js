import { supabase } from "../lib/supabase";
function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
export async function getOrderPayments() {
  const client = requireSupabase();
  const pageSize = 1000;
  const payments = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("order_payments")
      .select("id, order_id, amount, payment_method, notes, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error)
      throw new Error(`No se pudieron cargar los pagos: ${error.message}`);
    payments.push(...data);
    if (data.length < pageSize) return payments;
  }
}

export async function getOrderRefunds() {
  const client = requireSupabase();
  const pageSize = 1000;
  const refunds = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("order_refunds")
      .select(
        "id, order_id, payment_id, product_return_id, amount, refund_method, notes, created_at",
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error)
      throw new Error(
        `No se pudieron cargar las devoluciones: ${error.message}`,
      );
    refunds.push(...data);
    if (data.length < pageSize) return refunds;
  }
}

export async function getProductReturns() {
  const client = requireSupabase();
  const pageSize = 1000;
  const returns = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("order_product_returns")
      .select("id, order_id, quantity, item_condition, notes, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error)
      throw new Error(
        `No se pudieron cargar las devoluciones de productos: ${error.message}`,
      );
    returns.push(...data);
    if (data.length < pageSize) return returns;
  }
}

export async function recordOrderPayment(input) {
  const { error } = await requireSupabase().rpc("record_order_payment", {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes || null,
  });
  if (error) throw new Error(`No se pudo registrar el pago: ${error.message}`);
}

export async function recordDeliveredProductReturn(input) {
  const { error } = await requireSupabase().rpc(
    "record_delivered_product_return",
    {
      p_order_id: input.orderId,
      p_quantity: input.quantity,
      p_item_condition: input.itemCondition,
      p_payment_id: input.paymentId || null,
      p_refund_amount: input.refundAmount,
      p_refund_method: input.refundAmount > 0 ? input.refundMethod : null,
      p_notes: input.notes || null,
    },
  );
  if (error)
    throw new Error(`No se pudo registrar la devolución del producto: ${error.message}`);
}

export async function recordOrderRefund(input) {
  const { error } = await requireSupabase().rpc("record_order_refund", {
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_refund_method: input.refundMethod,
    p_notes: input.notes || null,
  });
  if (error)
    throw new Error(`No se pudo registrar la devolución: ${error.message}`);
}

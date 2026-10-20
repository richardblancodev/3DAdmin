import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  PackageCheck,
  RotateCcw,
  Search,
} from "lucide-react";
import { getWorkOrders, getWorkshopSettings } from "../services/business";
import {
  getOrderPayments,
  getOrderRefunds,
  getProductReturns,
  recordDeliveredProductReturn,
} from "../services/payments";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";

const conditionLabels = {
  resalable: "Revendible",
  repair: "Requiere reparación",
  scrap: "No aprovechable",
};

const refundMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

export default function ProductReturnsModule() {
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [returns, setReturns] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [returnQuantity, setReturnQuantity] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextOrders, nextPayments, nextRefunds, nextReturns, nextSettings] =
        await Promise.all([
          getWorkOrders(),
          getOrderPayments(),
          getOrderRefunds(),
          getProductReturns(),
          getWorkshopSettings(),
        ]);
      setOrders(nextOrders);
      setPayments(nextPayments);
      setRefunds(nextRefunds);
      setReturns(nextReturns);
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las devoluciones de productos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ordersById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );
  const returnedByOrder = useMemo(() => {
    const totals = new Map();
    for (const item of returns)
      totals.set(
        item.order_id,
        (totals.get(item.order_id) ?? 0) + item.quantity,
      );
    return totals;
  }, [returns]);
  const refundedByPayment = useMemo(() => {
    const totals = new Map();
    for (const refund of refunds)
      totals.set(
        refund.payment_id,
        (totals.get(refund.payment_id) ?? 0) + refund.amount,
      );
    return totals;
  }, [refunds]);
  const refundedByProductReturns = useMemo(() => {
    const totals = new Map();
    for (const refund of refunds) {
      if (!refund.product_return_id) continue;
      totals.set(
        refund.order_id,
        (totals.get(refund.order_id) ?? 0) + refund.amount,
      );
    }
    return totals;
  }, [refunds]);
  const deliveredOrders = orders.filter(
    (order) =>
      order.status === "delivered" &&
      (returnedByOrder.get(order.id) ?? 0) < order.quantity,
  );
  const visibleOrders = deliveredOrders.filter((order) =>
    `${order.product_name} ${order.customer_name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selectedPayments = selectedOrder
    ? payments.filter((payment) => payment.order_id === selectedOrder.id)
    : [];
  const availablePayments = selectedPayments.filter(
    (payment) =>
      payment.amount - (refundedByPayment.get(payment.id) ?? 0) > 0.005,
  );
  const maxRefundForQuantity = selectedOrder
    ? Math.max(
        0,
        Math.round(
          (selectedOrder.sale_price *
            ((returnedByOrder.get(selectedOrder.id) ?? 0) +
              Number(returnQuantity)) *
            100) /
            selectedOrder.quantity,
        ) /
          100 -
          (refundedByProductReturns.get(selectedOrder.id) ?? 0),
      )
    : 0;
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity"));
    const paymentId = String(form.get("payment_id"));
    const refundAmount = Number(form.get("refund_amount") || 0);
    const payment = selectedPayments.find((item) => item.id === paymentId);
    const paymentAvailable = payment
      ? payment.amount - (refundedByPayment.get(payment.id) ?? 0)
      : 0;
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity >
        selectedOrder.quantity - (returnedByOrder.get(selectedOrder.id) ?? 0)
    ) {
      setFormError(
        "La cantidad supera las unidades disponibles para devolución.",
      );
      return;
    }
    if (
      !Number.isFinite(refundAmount) ||
      refundAmount < 0 ||
      refundAmount > maxRefundForQuantity + 0.004 ||
      (refundAmount > 0 && (!payment || refundAmount > paymentAvailable + 0.004))
    ) {
      setFormError(
        "El reembolso debe respetar el valor de las unidades devueltas y el saldo del abono seleccionado.",
      );
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      await recordDeliveredProductReturn({
        orderId: selectedOrder.id,
        quantity,
        itemCondition: String(form.get("item_condition")),
        paymentId: refundAmount > 0 ? paymentId : null,
        refundAmount,
        refundMethod:
          refundAmount > 0 ? String(form.get("refund_method")) : null,
        notes: String(form.get("notes")).trim(),
      });
      setSelectedOrder(null);
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la devolución del producto.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">POSVENTA Y GARANTÍAS</p>
          <h1>Devoluciones de producto</h1>
          <p className="muted">
            Registra unidades devueltas de pedidos entregados y el reembolso asociado.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          Actualizar
        </button>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <p className="message info">
        El reembolso se registra manualmente después de devolver el dinero al
        cliente. La devolución del producto no aumenta automáticamente el
        inventario de filamento ni de productos.
      </p>
      <div className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon purple">
            <RotateCcw size={18} />
          </span>
          <span className="stat-label">Unidades devueltas</span>
          <strong>
            {returns.reduce((total, item) => total + item.quantity, 0)}
          </strong>
          <small>{returns.length} registros de devolución</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <PackageCheck size={18} />
          </span>
          <span className="stat-label">Reembolsos asociados</span>
          <strong>
            {fmt(
              [...refundedByProductReturns.values()].reduce(
                (total, amount) => total + amount,
                0,
              ),
            )}
          </strong>
          <small>Importe devuelto para productos</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue">
            <ClipboardCheck size={18} />
          </span>
          <span className="stat-label">Pedidos con unidades pendientes</span>
          <strong>{deliveredOrders.length}</strong>
          <small>Pedidos entregados que admiten devoluciones</small>
        </article>
      </div>
      <section className="inventory-panel">
        <div className="panel-heading orders-toolbar">
          <div>
            <h2>Pedidos entregados</h2>
            <p className="muted">
              La cantidad acumulada de devoluciones no puede superar las unidades del pedido.
            </p>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Buscar pedidos entregados"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pedido o cliente"
              value={search}
            />
          </label>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando pedidos…
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="empty-state">
            <PackageCheck size={30} />
            <strong>
              {deliveredOrders.length === 0
                ? "No hay pedidos con unidades pendientes de devolución"
                : "No hay resultados"}
            </strong>
            <span>
              {deliveredOrders.length === 0
                ? "Los pedidos entregados aparecerán aquí."
                : "Prueba otra búsqueda."}
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Unidades</th>
                  <th>Devueltas</th>
                  <th>Por devolver</th>
                  <th>Precio</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const returned = returnedByOrder.get(order.id) ?? 0;
                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.product_name}</strong>
                      </td>
                      <td>{order.customer_name}</td>
                      <td>{order.quantity}</td>
                      <td>{returned}</td>
                      <td>
                        <strong>{order.quantity - returned}</strong>
                      </td>
                      <td>{fmt(order.sale_price)}</td>
                      <td>
                        <button
                          className="button secondary payment-action"
                          onClick={() => {
                            setFormError("");
                            setReturnQuantity(
                              Math.min(1, order.quantity - returned),
                            );
                            setSelectedOrder(order);
                          }}
                          type="button"
                        >
                          <RotateCcw size={15} />
                          Registrar devolución
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>Historial de productos devueltos</h2>
            <p className="muted">
              Se conserva el estado del artículo y el reembolso registrado.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando historial…
          </div>
        ) : returns.length === 0 ? (
          <div className="empty-state">
            <ClipboardCheck size={28} />
            <strong>Aún no hay devoluciones de productos</strong>
            <span>Los registros aparecerán aquí después de capturarlos.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Unidades</th>
                  <th>Estado del producto</th>
                  <th>Reembolso</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {returns.slice(0, 100).map((item) => {
                  const order = ordersById.get(item.order_id);
                  const refundAmount = refunds
                    .filter((refund) => refund.product_return_id === item.id)
                    .reduce((sum, refund) => sum + refund.amount, 0);
                  return (
                    <tr key={item.id}>
                      <td>
                        {new Date(item.created_at).toLocaleString("es-CO")}
                      </td>
                      <td>{order?.product_name ?? "Pedido"}</td>
                      <td>{order?.customer_name ?? "—"}</td>
                      <td>{item.quantity}</td>
                      <td>{conditionLabels[item.item_condition]}</td>
                      <td>
                        {refundAmount > 0 ? fmt(refundAmount) : "Sin reembolso"}
                      </td>
                      <td>{item.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedOrder && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setSelectedOrder(null);
          }}
        >
          <section
            aria-labelledby="product-return-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DEVOLUCIÓN POSVENTA</p>
                <h2 id="product-return-title">{selectedOrder.product_name}</h2>
                <p className="muted">{selectedOrder.customer_name}</p>
              </div>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <label>
                Unidades que devuelve el cliente
                <input
                  max={
                    selectedOrder.quantity -
                    (returnedByOrder.get(selectedOrder.id) ?? 0)
                  }
                  min="1"
                  name="quantity"
                  onChange={(event) =>
                    setReturnQuantity(Math.max(1, Number(event.target.value)))
                  }
                  required
                  step="1"
                  type="number"
                  value={returnQuantity}
                />
              </label>
              <label>
                Estado del producto recibido
                <select defaultValue="resalable" name="item_condition">
                  <option value="resalable">Revendible</option>
                  <option value="repair">Requiere reparación</option>
                  <option value="scrap">No aprovechable</option>
                </select>
              </label>
              <p className="message info">
                Reembolso máximo acumulado para estas unidades:{" "}
                <strong>{fmt(maxRefundForQuantity)}</strong>. Confirma el
                reembolso externamente antes de registrarlo.
              </p>
              {formError && (
                <p className="message error" role="alert">
                  {formError}
                </p>
              )}
              <label>
                Abono a reembolsar (opcional)
                <select defaultValue="" name="payment_id">
                  <option value="">Sin reembolso</option>
                  {availablePayments.map((payment) => {
                    const available =
                      payment.amount -
                      (refundedByPayment.get(payment.id) ?? 0);
                    return (
                      <option key={payment.id} value={payment.id}>
                        {new Date(payment.created_at).toLocaleDateString(
                          "es-CO",
                        )}{" "}
                        · Disponible {fmt(available)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Importe a devolver
                <input
                  defaultValue="0"
                  max={maxRefundForQuantity}
                  min="0"
                  name="refund_amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Método de reembolso
                <select defaultValue="transfer" name="refund_method">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label>
                Nota (opcional)
                <input
                  maxLength={500}
                  name="notes"
                  placeholder="Motivo, revisión o detalle del artículo"
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setSelectedOrder(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Guardando…" : "Guardar devolución"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

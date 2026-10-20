import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  ClipboardList,
  Clock3,
  Layers3,
} from "lucide-react";
import { getWorkOrders, getWorkshopSettings } from "../services/business";
import { getOrderRefunds } from "../services/payments";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";
const statusLabels = {
  pending: "Pendiente",
  printing: "En impresión",
  post_processing: "Post-procesamiento",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export default function Dashboard({ rolls, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    Promise.all([getWorkOrders(), getWorkshopSettings(), getOrderRefunds()])
      .then(([nextOrders, nextSettings, nextRefunds]) => {
        setOrders(nextOrders);
        setSettings(nextSettings);
        setRefunds(nextRefunds);
      })
      .catch((error) =>
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los indicadores.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const activeOrders = orders.filter(
    (order) => order.status !== "delivered" && order.status !== "cancelled",
  ).length;
  const deliveredRevenue =
    orders
      .filter((order) => order.status === "delivered")
      .reduce((total, order) => total + order.sale_price, 0) -
    refunds.reduce(
      (total, refund) =>
        refund.product_return_id ? total + refund.amount : total,
      0,
    );
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  const remainingWeight = rolls.reduce(
    (total, roll) => total + roll.remaining_weight_g,
    0,
  );
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESUMEN DEL TALLER</p>
          <h1>Panel general</h1>
          <p className="muted">
            Una vista rápida del inventario y la producción.
          </p>
        </div>
        <button className="button primary" onClick={() => onNavigate("orders")}>
          <ClipboardList size={16} />
          Ir a pedidos
        </button>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="stats-grid dashboard-stats">
        <article className="stat-card">
          <span className="stat-icon purple">
            <Layers3 size={18} />
          </span>
          <span className="stat-label">Bobinas registradas</span>
          <strong>{rolls.length}</strong>
          <small>Inventario de filamentos</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue">
            <Box size={18} />
          </span>
          <span className="stat-label">Filamento disponible</span>
          <strong>
            {new Intl.NumberFormat("es-CO", {
              maximumFractionDigits: 0,
            }).format(remainingWeight)}{" "}
            <small>g</small>
          </strong>
          <small>Peso restante total</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon purple">
            <Clock3 size={18} />
          </span>
          <span className="stat-label">Pedidos en producción</span>
          <strong>{loading ? "—" : activeOrders}</strong>
          <small>Pendientes de entregar</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon green">
            <BadgeCheck size={18} />
          </span>
          <span className="stat-label">
            Ventas tras reembolsos (incl. IVA)
          </span>
          <strong>{loading ? "—" : fmt(deliveredRevenue)}</strong>
          <small>Descuenta reembolsos de productos devueltos</small>
        </article>
      </div>
      <section className="inventory-panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <h2>Actividad reciente</h2>
            <p className="muted">Últimos pedidos creados en el taller.</p>
          </div>
          <button className="inline-link" onClick={() => onNavigate("orders")}>
            Ver pedidos <ArrowRight size={14} />
          </button>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando resumen…
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={30} />
            <strong>Aún no hay actividad</strong>
            <span>Al crear pedidos, aparecerán aquí.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Venta</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr>
                    <td>
                      <strong>{order.product_name}</strong>
                    </td>
                    <td>{order.customer_name}</td>
                    <td>
                      {new Date(order.created_at).toLocaleDateString("es-CO")}
                    </td>
                    <td>
                      <span className={`order-status ${order.status}`}>
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td>{fmt(order.sale_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="quick-links">
        <button onClick={() => onNavigate("inventory")}>
          <Layers3 size={16} />
          <span>
            <strong>Revisar inventario</strong>
            <small>Consulta filamentos y existencias</small>
          </span>
          <ArrowRight size={15} />
        </button>
        <button onClick={() => onNavigate("costs")}>
          <Box size={16} />
          <span>
            <strong>Calcular un precio</strong>
            <small>Estima el costo de impresión</small>
          </span>
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

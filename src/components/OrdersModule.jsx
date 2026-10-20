import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ClipboardList,
  Eye,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  cancelWorkOrder,
  createCustomer,
  createWorkOrder,
  getCustomers,
  getPrinters,
  getProducts,
  getWorkOrders,
  getWorkshopSettings,
  updateWorkOrderStatus,
} from "../services/business";
import {
  defaultWorkshopSettings,
  calculateVatAmount,
  estimatePrintCost,
  formatCurrency,
  getEffectiveVatRate,
} from "../utils/business";
const statusLabels = {
  pending: "Pendiente",
  printing: "En impresión",
  post_processing: "Post-procesamiento",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
const statuses = [
  "pending",
  "printing",
  "post_processing",
  "delivered",
  "cancelled",
];
const nextStatus = {
  pending: "printing",
  printing: "post_processing",
  post_processing: "delivered",
  delivered: null,
  cancelled: null,
};
export default function OrdersModule({ rolls, onInventoryUpdated }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [gramsEach, setGramsEach] = useState(0);
  const [hoursEach, setHoursEach] = useState(0);
  const [postProcessingHoursEach, setPostProcessingHoursEach] = useState(0);
  const [orderProductName, setOrderProductName] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancellationOrder, setCancellationOrder] = useState(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [
        nextCustomers,
        nextOrders,
        nextSettings,
        nextProducts,
        nextPrinters,
      ] = await Promise.all([
        getCustomers(),
        getWorkOrders(),
        getWorkshopSettings(),
        getProducts(),
        getPrinters(),
      ]);
      setCustomers(nextCustomers);
      setOrders(nextOrders);
      setSettings(nextSettings);
      setProducts(nextProducts);
      setPrinters(nextPrinters);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los pedidos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const totals = useMemo(
    () =>
      statuses.map((status) => ({
        status,
        count: orders.filter((order) => order.status === status).length,
      })),
    [orders],
  );
  const visibleOrders = orders.filter((order) => {
    const matchesSearch = `${order.product_name} ${order.customer_name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return (
      matchesSearch && (statusFilter === "all" || order.status === statusFilter)
    );
  });
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  async function handleCreateCustomer(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("privacy_consent") !== "on") {
      setErrorMessage(
        "La autorización del cliente es necesaria para guardarlo en el directorio.",
      );
      return;
    }
    const customer = {
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      phone: String(form.get("phone")).trim(),
      privacy_consent_method: String(form.get("privacy_consent_method")),
    };
    setBusy(true);
    setErrorMessage("");
    try {
      const created = await createCustomer(customer);
      setCustomers((existing) =>
        [...existing, created].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setShowCustomerForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cliente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleCreateOrder(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customerId = String(form.get("customer_id")) || null;
    const customer = customers.find(
      (item) =>
        item.id === customerId && item.privacy_consent_status === "granted",
    );
    const enteredCustomerName = String(form.get("customer_name")).trim();
    const customerName =
      (customer?.name ?? enteredCustomerName) || "Cliente ocasional";
    if (
      !customer &&
      enteredCustomerName &&
      form.get("order_customer_consent") !== "on"
    ) {
      setErrorMessage(
        "Confirma que el cliente autorizó guardar su nombre en el pedido o deja el campo vacío para usar “Cliente ocasional”.",
      );
      return;
    }
    const selectedRoll = rolls.find(
      (roll) => roll.id === String(form.get("filament_roll_id")),
    );
    const selectedProduct = products.find(
      (product) => product.id === selectedProductId,
    );
    const selectedPrinter = printers.find(
      (printer) => printer.id === selectedPrinterId,
    );
    const quantity = Number(form.get("quantity"));
    const margin = Number(form.get("margin_percent"));
    if (gramsEach > 0 && !selectedRoll) {
      setErrorMessage(
        "Selecciona una bobina para poder descontar el material al iniciar la impresión.",
      );
      return;
    }
    const effectiveSettings = selectedPrinter
      ? {
          ...settings,
          printer_power_w: selectedPrinter.power_w,
          machine_wear_per_hour: selectedPrinter.wear_per_hour,
        }
      : settings;
    const estimate = estimatePrintCost(
      selectedRoll,
      gramsEach,
      hoursEach,
      effectiveSettings,
      margin,
      postProcessingHoursEach,
    );
    const rawSubtotal =
      Number(form.get("sale_price")) ||
      estimate.suggestedPrice * quantity ||
      (selectedProduct?.default_price ?? 0) * quantity;
    const saleSubtotal =
      Math.round((rawSubtotal + Number.EPSILON) * 100) / 100;
    const vatRate = getEffectiveVatRate(settings, selectedProduct?.vat_rate);
    const vatAmount = calculateVatAmount(saleSubtotal, vatRate);
    const input = {
      customer_id: customerId,
      product_id: selectedProduct?.id ?? null,
      filament_roll_id: gramsEach > 0 ? (selectedRoll?.id ?? null) : null,
      printer_id: selectedPrinter?.id ?? null,
      customer_name: customerName,
      product_name:
        String(form.get("product_name")).trim() || selectedProduct?.name || "",
      quantity,
      due_date: String(form.get("due_date")) || null,
      material_cost: estimate.materialCost * quantity,
      energy_cost: estimate.energyCost * quantity,
      machine_wear_cost: estimate.machineWearCost * quantity,
      labor_cost: estimate.laborCost * quantity,
      filament_grams_per_unit: gramsEach,
      print_hours_per_unit: hoursEach,
      post_processing_hours_per_unit: postProcessingHoursEach,
      suggested_price: estimate.suggestedPrice * quantity,
      sale_subtotal: saleSubtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      fiscal_entity_type: settings.entity_type,
      is_vat_responsible: settings.is_vat_responsible,
      fiscal_tax_regime: settings.tax_regime,
      fiscal_business_name: settings.business_name,
      fiscal_tax_id: settings.tax_id || null,
      document_prefix: settings.invoice_prefix,
      currency_code: settings.currency_code,
      sale_price: saleSubtotal + vatAmount,
    };
    setBusy(true);
    setErrorMessage("");
    try {
      await createWorkOrder(input);
      setShowOrderForm(false);
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo crear el pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleStatusChange(order, status) {
    setErrorMessage("");
    setBusy(true);
    try {
      await updateWorkOrderStatus(order.id, status);
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status,
              }
            : item,
        ),
      );
      await Promise.all([refresh(), onInventoryUpdated()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleCancel(event) {
    event.preventDefault();
    if (!cancellationOrder) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrorMessage("");
    try {
      await cancelWorkOrder(
        cancellationOrder.id,
        String(form.get("reason")).trim(),
        Number(form.get("recovered_filament_g") || 0),
      );
      setCancellationOrder(null);
      await Promise.all([refresh(), onInventoryUpdated()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cancelar el pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLIENTES Y PRODUCCIÓN</p>
          <h1>Pedidos</h1>
          <p className="muted">
            Registra ventas y sigue cada pedido hasta su entrega.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() => setShowCustomerForm(true)}
          >
            <UserRound size={16} />
            Nuevo cliente
          </button>
          <button
            className="button primary"
            onClick={() => {
              setSelectedProductId("");
              setSelectedPrinterId("");
              setGramsEach(0);
              setHoursEach(0);
              setPostProcessingHoursEach(0);
              setOrderProductName("");
              setShowOrderForm(true);
            }}
          >
            <Plus size={17} />
            Crear pedido
          </button>
        </div>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="order-stats">
        {totals.map(({ status, count }) => (
          <article className="order-stat" key={status}>
            <span className={`status-dot ${status}`} />
            <span>{statusLabels[status]}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>
      <section className="inventory-panel orders-panel">
        <div className="panel-heading orders-toolbar">
          <div>
            <h2>Seguimiento de producción</h2>
            <p className="muted">
              Actualiza el estado de cada trabajo según avanza el taller.
            </p>
          </div>
          <div className="order-filters">
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Buscar pedidos"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pedido o cliente"
                value={search}
              />
            </label>
            <select
              aria-label="Filtrar por estado"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">Todos los estados</option>
              {statuses.map((status) => (
                <option value={status}>{statusLabels[status]}</option>
              ))}
            </select>
            <span className="order-count">{visibleOrders.length} pedidos</span>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando pedidos…
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={30} />
            <strong>Aún no hay pedidos</strong>
            <span>
              Crea un cliente y registra el primer trabajo de producción.
            </span>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={30} />
            <strong>No hay resultados</strong>
            <span>Cambia la búsqueda o el filtro de estado.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Producto / pedido</th>
                  <th>Cliente</th>
                  <th>Entrega</th>
                  <th>Total acordado</th>
                  <th>Producción</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div className="order-product">
                        <strong>{order.product_name}</strong>
                        <small>
                          {order.quantity}{" "}
                          {order.quantity === 1 ? "unidad" : "unidades"} · Costo{" "}
                          {fmt(
                            order.material_cost +
                              order.energy_cost +
                            order.machine_wear_cost +
                            (order.labor_cost ?? 0),
                          )}
                        </small>
                      </div>
                    </td>
                    <td>{order.customer_name}</td>
                    <td>
                      {order.due_date
                        ? new Date(
                            `${order.due_date}T00:00:00`,
                          ).toLocaleDateString("es-CO")
                        : "—"}
                    </td>
                    <td>
                      <strong>{fmt(order.sale_price)}</strong>
                    </td>
                    <td>
                      <select
                        aria-label={`Estado de ${order.product_name}`}
                        className={`status-select ${order.status}`}
                        disabled={busy || order.status === "cancelled"}
                        onChange={(event) => {
                          void handleStatusChange(order, event.target.value);
                        }}
                        value={order.status}
                      >
                        {statuses
                          .filter(
                            (status) =>
                              status === order.status ||
                              status === nextStatus[order.status],
                          )
                          .map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Ver ${order.product_name}`}
                          className="icon-button"
                          onClick={() => setSelectedOrder(order)}
                          type="button"
                        >
                          <Eye size={15} />
                        </button>
                        {["pending", "printing", "post_processing"].includes(
                          order.status,
                        ) && (
                          <button
                            aria-label={`Cancelar ${order.product_name}`}
                            className="icon-button danger-icon"
                            disabled={busy}
                            onClick={() => {
                              setErrorMessage("");
                              setCancellationOrder(order);
                            }}
                            type="button"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
            if (event.target === event.currentTarget) setSelectedOrder(null);
          }}
        >
          <section
            aria-labelledby="order-detail-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DETALLE DEL PEDIDO</p>
                <h2 id="order-detail-title">{selectedOrder.product_name}</h2>
              </div>
              <button
                aria-label="Cerrar detalle"
                className="icon-button"
                onClick={() => setSelectedOrder(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <dl className="detail-grid">
              <dt>Cliente</dt>
              <dd>{selectedOrder.customer_name}</dd>
              <dt>Estado</dt>
              <dd>{statusLabels[selectedOrder.status]}</dd>
              <dt>Unidades</dt>
              <dd>{selectedOrder.quantity}</dd>
              <dt>Entrega</dt>
              <dd>
                {selectedOrder.due_date
                  ? new Date(
                      `${selectedOrder.due_date}T00:00:00`,
                    ).toLocaleDateString("es-CO")
                  : "Sin fecha"}
              </dd>
              <dt>Material</dt>
              <dd>
                {selectedOrder.filament_grams_per_unit * selectedOrder.quantity}{" "}
                g · {fmt(selectedOrder.material_cost)}
              </dd>
              <dt>Energía</dt>
              <dd>{fmt(selectedOrder.energy_cost)}</dd>
              <dt>Desgaste</dt>
              <dd>{fmt(selectedOrder.machine_wear_cost)}</dd>
              <dt>Mano de obra / postprocesamiento</dt>
              <dd>
                {selectedOrder.post_processing_hours_per_unit ?? 0} h ·{" "}
                {fmt(selectedOrder.labor_cost ?? 0)}
              </dd>
              <dt>
                {selectedOrder.is_vat_responsible
                  ? "Precio sugerido antes de IVA"
                  : "Precio sugerido"}
              </dt>
              <dd>{fmt(selectedOrder.suggested_price)}</dd>
              <dt>Subtotal</dt>
              <dd>
                {fmt(selectedOrder.sale_subtotal ?? selectedOrder.sale_price)}
              </dd>
              {selectedOrder.is_vat_responsible && (
                <>
                  <dt>IVA ({(selectedOrder.vat_rate * 100).toFixed(2)}%)</dt>
                  <dd>{fmt(selectedOrder.vat_amount)}</dd>
                </>
              )}
              <dt>Total acordado</dt>
              <dd>{fmt(selectedOrder.sale_price)}</dd>
              <dt>Creado</dt>
              <dd>
                {new Date(selectedOrder.created_at).toLocaleString("es-CO")}
              </dd>
            </dl>
          </section>
        </div>
      )}
      {cancellationOrder && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setCancellationOrder(null);
          }}
        >
          <section
            aria-labelledby="cancel-order-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CANCELACIÓN SEGURA</p>
                <h2 id="cancel-order-title">
                  Cancelar {cancellationOrder.product_name}
                </h2>
                <p className="muted">{cancellationOrder.customer_name}</p>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                disabled={busy}
                onClick={() => setCancellationOrder(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => void handleCancel(event)}
            >
              <p className="message info">
                {cancellationOrder.status === "pending"
                  ? "Este pedido aún no ha consumido material."
                  : cancellationOrder.filament_roll_id &&
                      cancellationOrder.filament_grams_per_unit > 0
                    ? `La impresión descontó ${cancellationOrder.filament_grams_per_unit * cancellationOrder.quantity} g. Indica solo los gramos que realmente se recuperaron; el resto seguirá contado como consumo.`
                    : "Este pedido no tiene consumo de filamento asociado."}{" "}
                Si tiene abonos, registra primero su devolución desde el módulo
                Devoluciones.
              </p>
              {cancellationOrder.status !== "pending" &&
                cancellationOrder.filament_roll_id &&
                cancellationOrder.filament_grams_per_unit > 0 && (
                  <label>
                    Filamento recuperado (g)
                    <input
                      defaultValue="0"
                      max={
                        cancellationOrder.filament_grams_per_unit *
                        cancellationOrder.quantity
                      }
                      min="0"
                      name="recovered_filament_g"
                      required
                      step="0.01"
                      type="number"
                    />
                  </label>
                )}
              <label>
                Motivo (opcional)
                <input
                  autoFocus
                  maxLength={500}
                  name="reason"
                  placeholder="Describe brevemente el motivo"
                />
              </label>
              {errorMessage && (
                <p className="message error" role="alert">
                  {errorMessage}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setCancellationOrder(null)}
                  type="button"
                >
                  Volver
                </button>
                <button
                  className="button primary danger-button"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Cancelando…" : "Confirmar cancelación"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showOrderForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowOrderForm(false);
          }}
        >
          <section
            aria-labelledby="order-title"
            aria-modal="true"
            className="modal-card wide-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PRODUCCIÓN</p>
                <h2 id="order-title">Crear pedido</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setShowOrderForm(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <form className="form-stack" onSubmit={handleCreateOrder}>
              <div className="field-grid">
                <label className="span-two">
                  Cliente
                  <select defaultValue="" name="customer_id">
                    <option value="">Pedido sin cliente registrado</option>
                    {customers
                      .filter(
                        (customer) =>
                          customer.privacy_consent_status === "granted",
                      )
                      .map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="span-two">
                  Nombre del cliente (opcional)
                  <input
                    maxLength={120}
                    name="customer_name"
                    placeholder="Cliente ocasional"
                  />
                </label>
                <label className="checkbox-field span-two">
                  <input name="order_customer_consent" type="checkbox" />
                  Si escribo un nombre, confirmo que el cliente autorizó
                  incluirlo en este pedido. Sin autorización, lo dejaré vacío
                  y se usará “Cliente ocasional”.
                </label>
                <label>
                  Plantilla del catálogo
                  <select
                    onChange={(event) => {
                      const product = products.find(
                        (item) => item.id === event.target.value,
                      );
                      setSelectedProductId(product?.id ?? "");
                      setOrderProductName(product?.name ?? "");
                      setGramsEach(product?.grams_per_unit ?? 0);
                      setHoursEach(product?.hours_per_unit ?? 0);
                      setPostProcessingHoursEach(
                        product?.post_processing_hours_per_unit ?? 0,
                      );
                    }}
                    value={selectedProductId}
                  >
                    <option value="">Trabajo personalizado</option>
                    {products.map((product) => (
                      <option value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Impresora
                  <select
                    onChange={(event) =>
                      setSelectedPrinterId(event.target.value)
                    }
                    value={selectedPrinterId}
                  >
                    <option value="">Usar parámetros promedio</option>
                    {printers
                      .filter((printer) => printer.status !== "inactive")
                      .map((printer) => (
                        <option value={printer.id}>
                          {printer.name} · {printer.power_w} W
                        </option>
                      ))}
                  </select>
                </label>
                <label className="span-two">
                  Producto o trabajo
                  <input
                    autoFocus
                    maxLength={160}
                    name="product_name"
                    onChange={(event) =>
                      setOrderProductName(event.target.value)
                    }
                    placeholder="Ej. Soporte personalizado"
                    required
                    value={orderProductName}
                  />
                </label>
                <label className="span-two">
                  Bobina de filamento
                  <select defaultValue="" name="filament_roll_id">
                    <option value="">No requiere filamento</option>
                    {rolls
                      .filter((roll) => roll.remaining_weight_g > 0)
                      .map((roll) => (
                        <option value={roll.id}>
                          {roll.brand} · {roll.material} · {roll.color} (
                          {roll.remaining_weight_g} g)
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Unidades
                  <input
                    defaultValue="1"
                    min="1"
                    name="quantity"
                    required
                    step="1"
                    type="number"
                  />
                </label>
                <label>
                  Material por unidad (g)
                  <input
                    min="0"
                    onChange={(event) =>
                      setGramsEach(Number(event.target.value))
                    }
                    required
                    step="0.1"
                    type="number"
                    value={gramsEach}
                  />
                </label>
                <label>
                  Impresión por unidad (h)
                  <input
                    min="0"
                    onChange={(event) =>
                      setHoursEach(Number(event.target.value))
                    }
                    required
                    step="0.1"
                    type="number"
                    value={hoursEach}
                  />
                </label>
                <label>
                  Postprocesamiento por unidad (h)
                  <input
                    min="0"
                    onChange={(event) =>
                      setPostProcessingHoursEach(Number(event.target.value))
                    }
                    required
                    step="0.1"
                    type="number"
                    value={postProcessingHoursEach}
                  />
                </label>
                <label>
                  Margen (%)
                  <input
                    defaultValue={settings.default_margin_percent}
                    min="0"
                    name="margin_percent"
                    required
                    step="1"
                    type="number"
                  />
                </label>
                <label>
                  {settings.is_vat_responsible
                    ? "Precio acordado antes de IVA (subtotal)"
                    : "Precio acordado"}
                  <input
                    min="0"
                    name="sale_price"
                    placeholder="Deja vacío para usar el sugerido"
                    step="1"
                    type="number"
                  />
                </label>
                <label className="span-two">
                  Fecha de entrega
                  <input
                    min={new Date().toISOString().slice(0, 10)}
                    name="due_date"
                    type="date"
                  />
                </label>
              </div>
              <p className="message info">
                El costo se guarda con el pedido. Al cambiarlo a “En impresión”,
                Supabase descuenta el material de forma atómica y registra el
                movimiento. Un pedido sin bobina no descuenta stock.{" "}
                {settings.is_vat_responsible
                  ? `Se aplicará IVA del ${((selectedProduct?.vat_rate ?? settings.default_vat_rate) * 100).toFixed(2)}% sobre el subtotal, según la configuración vigente.`
                  : "El perfil actual no desglosa ni suma IVA."}
              </p>
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowOrderForm(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Guardando…" : "Guardar pedido"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showCustomerForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShowCustomerForm(false);
          }}
        >
          <section
            aria-labelledby="customer-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CLIENTES</p>
                <h2 id="customer-title">Nuevo cliente</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setShowCustomerForm(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <form className="form-stack" onSubmit={handleCreateCustomer}>
              <p className="message info">
                Este registro agregará al cliente al directorio del taller.
                Confirma que autorizó guardar sus datos para gestionar
                cotizaciones, pedidos y comunicaciones relacionadas.
              </p>
              <label>
                Nombre
                <input autoFocus maxLength={120} name="name" required />
              </label>
              <label>
                Correo electrónico
                <input autoComplete="email" name="email" type="email" />
              </label>
              <label>
                Teléfono
                <input autoComplete="tel" name="phone" />
              </label>
              <label className="checkbox-field">
                <input name="privacy_consent" required type="checkbox" />
                El cliente autorizó el tratamiento de sus datos y recibió
                información sobre su uso.
              </label>
              <label>
                Medio por el que se obtuvo la autorización
                <select
                  defaultValue="written"
                  name="privacy_consent_method"
                  required
                >
                  <option value="written">Escrita</option>
                  <option value="verbal">Verbal</option>
                  <option value="digital">Digital</option>
                  <option value="other">Otro medio</option>
                </select>
              </label>
              {errorMessage && (
                <p className="message error" role="alert">
                  {errorMessage}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowCustomerForm(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Guardando…" : "Guardar cliente"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

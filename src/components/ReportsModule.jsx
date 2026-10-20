import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { getAdministrativeReportData } from "../services/reports";
import {
  defaultWorkshopSettings,
  formatCurrency,
} from "../utils/business";

const orderStatusLabels = {
  pending: "Pendiente",
  printing: "En impresión",
  post_processing: "Post-procesamiento",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const movementLabels = {
  purchase: "Compra",
  consumption: "Consumo",
  adjustment: "Ajuste",
};

const paymentMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

const returnConditionLabels = {
  resalable: "Revendible",
  repair: "Requiere reparación",
  scrap: "No aprovechable",
};

function safeText(value) {
  const text = String(value ?? "");
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function createSheet(XLSX, headers, rows, widths) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) =>
      row.map((value) => (typeof value === "string" ? safeText(value) : value)),
    ),
  ]);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length > 0) {
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 },
      }),
    };
  }
  return worksheet;
}

function addSheet(XLSX, workbook, name, headers, rows, widths) {
  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(XLSX, headers, rows, widths),
    name,
  );
}

function isWithinDates(row, startDate, endDate) {
  if (!row.created_at) return true;
  const date = row.created_at.slice(0, 10);
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function cents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getNetSalesBeforeVat(order, productRefundAmount) {
  const vatRate = Number(order.vat_rate) || 0;
  const refundAmount = Number(productRefundAmount) || 0;
  const refundedVat =
    vatRate > 0 ? cents((refundAmount * vatRate) / (1 + vatRate)) : 0;
  return cents(
    (Number(order.sale_subtotal ?? order.sale_price) || 0) -
      (refundAmount - refundedVat),
  );
}

function createReportSheets(
  XLSX,
  workbook,
  data,
  startDate,
  endDate,
  reportType,
) {
  const {
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
    settings,
  } = data;
  const periodOrders = orders.filter((row) =>
    isWithinDates(row, startDate, endDate),
  );
  const periodPayments = payments.filter((row) =>
    isWithinDates(row, startDate, endDate),
  );
  const periodRefunds = refunds.filter((row) =>
    isWithinDates(row, startDate, endDate),
  );
  const periodReturns = productReturns.filter((row) =>
    isWithinDates(row, startDate, endDate),
  );
  const periodMovements = inventoryMovements.filter((row) =>
    isWithinDates(row, startDate, endDate),
  );
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const refundsByOrder = new Map();
  const refundedByPayment = new Map();
  const paidByOrder = new Map();

  for (const refund of refunds) {
    refundsByOrder.set(
      refund.order_id,
      (refundsByOrder.get(refund.order_id) ?? 0) + Number(refund.amount),
    );
    refundedByPayment.set(
      refund.payment_id,
      (refundedByPayment.get(refund.payment_id) ?? 0) + Number(refund.amount),
    );
  }
  for (const payment of payments)
    paidByOrder.set(
      payment.order_id,
      (paidByOrder.get(payment.order_id) ?? 0) + Number(payment.amount),
    );
  for (const refund of refunds)
    paidByOrder.set(
      refund.order_id,
      (paidByOrder.get(refund.order_id) ?? 0) - Number(refund.amount),
    );

  const reportLabel =
    startDate || endDate
      ? `${startDate || "inicio"} a ${endDate || "hoy"}`
      : "Todo el historial";
  const currency = settings?.currency_code ?? defaultWorkshopSettings.currency_code;
  const deliveredOrders = periodOrders.filter(
    (order) => order.status === "delivered",
  );
  const collected = periodPayments.reduce(
    (total, payment) => total + Number(payment.amount),
    0,
  );
  const refunded = periodRefunds.reduce(
    (total, refund) => total + Number(refund.amount),
    0,
  );
  const deliveredSales = deliveredOrders.reduce(
    (total, order) => total + Number(order.sale_price),
    0,
  );
  const periodProductRefunds = periodRefunds
    .filter((refund) => refund.product_return_id)
    .reduce((total, refund) => total + Number(refund.amount), 0);
  const purchaseMovements = periodMovements.filter(
    (movement) => movement.movement_type === "purchase",
  );
  const recordedPurchases = purchaseMovements.filter(
    (movement) => Number(movement.purchase_total) > 0,
  );
  const purchaseTotal = recordedPurchases.reduce(
    (total, movement) => total + Number(movement.purchase_total),
    0,
  );
  const deductibleVat = recordedPurchases
    .filter((movement) => movement.purchase_vat_treatment === "deductible")
    .reduce(
      (total, movement) => total + Number(movement.purchase_vat_amount),
      0,
    );
  const netSalesBeforeVat = deliveredOrders.reduce(
    (total, order) =>
      total + getNetSalesBeforeVat(order, refundsByOrder.get(order.id)),
    0,
  );
  const outputVat = deliveredOrders.reduce((total, order) => {
    const vatRate = Number(order.vat_rate) || 0;
    const refundAmount = Number(refundsByOrder.get(order.id)) || 0;
    const refundVat =
      vatRate > 0 ? cents((refundAmount * vatRate) / (1 + vatRate)) : 0;
    return total + Number(order.vat_amount || 0) - refundVat;
  }, 0);
  const workbookSummary = [
    ["Informe administrativo y contable", ""],
    ["Rango de fechas", reportLabel],
    ["Generado el", new Date().toLocaleString("es-CO")],
    ["Moneda", currency],
    ["Perfil entidad", settings?.entity_type ?? "NATURAL_PERSON"],
    ["Responsable de IVA", settings?.is_vat_responsible ? "Sí" : "No"],
    ["Pedidos en el periodo", periodOrders.length],
    ["Pedidos entregados en el periodo", deliveredOrders.length],
    ["Valor de pedidos entregados creados en el rango (incl. IVA)", cents(deliveredSales)],
    ["Ventas antes de IVA; reembolsos acumulados a la fecha", cents(netSalesBeforeVat)],
    ["IVA neto registrado en pedidos entregados", cents(outputVat)],
    ["Abonos registrados en el periodo", cents(collected)],
    ["Reembolsos registrados en el periodo", cents(refunded)],
    ["Reembolsos por devoluciones de producto", cents(periodProductRefunds)],
    ["Recaudo neto por transacciones registradas en el periodo", cents(collected - refunded)],
    ["Compras con valor documentado", cents(purchaseTotal)],
    ["IVA descontable registrado en compras", cents(deductibleVat)],
    ["Compras antiguas sin importe detallado", purchaseMovements.length - recordedPurchases.length],
    ["Bobinas en inventario actual", filamentRolls.length],
    ["Artículos de hardware actuales", hardwareItems.length],
    ["Clientes", customers.length],
    ["Proveedores", suppliers.length],
    ["Productos de catálogo", products.length],
    ["Impresoras", printers.length],
    ["Nota", "Informe operativo para revisión. No reemplaza libros oficiales, declaraciones ni soportes tributarios."],
  ];
  addSheet(
    XLSX,
    workbook,
    "Resumen",
    ["Indicador", "Valor"],
    workbookSummary,
    [48, 85],
  );

  const orderRows = periodOrders.map((order) => {
    const refundedForOrder = refundsByOrder.get(order.id) ?? 0;
    const paidNet = paidByOrder.get(order.id) ?? 0;
    return [
      order.id,
      order.created_at,
      order.due_date ?? "",
      orderStatusLabels[order.status] ?? order.status,
      order.customer_name,
      order.product_name,
      order.quantity,
      order.material_cost,
      order.energy_cost,
      order.machine_wear_cost,
      order.labor_cost ?? 0,
      order.suggested_price,
      order.sale_subtotal ?? order.sale_price,
      order.vat_rate ?? 0,
      order.vat_amount ?? 0,
      order.sale_price,
      refundedForOrder,
      Number(order.sale_price) - refundedForOrder,
      getNetSalesBeforeVat(order, refundedForOrder),
      paidNet,
      Math.max(0, Number(order.sale_price) - paidNet),
      order.is_vat_responsible ? "Sí" : "No",
      order.fiscal_entity_type,
      order.fiscal_tax_regime,
      order.currency_code ?? currency,
    ];
  });
  const orderHeaders = [
    "ID pedido",
    "Fecha de registro",
    "Fecha de entrega prevista",
    "Estado",
    "Cliente",
    "Producto / trabajo",
    "Unidades",
    "Costo material",
    "Costo energía",
    "Desgaste máquina",
    "Mano de obra",
    "Precio sugerido",
    "Subtotal",
    "Tarifa IVA",
    "IVA",
    "Total acordado",
    "Reembolsos acumulados a la fecha",
    "Total tras reembolsos",
    "Venta neta sin IVA",
    "Recaudo neto",
    "Saldo pendiente",
    "Responsable IVA",
    "Tipo de entidad",
    "Régimen",
    "Moneda",
  ];

  const paymentRows = periodPayments.map((payment) => {
    const order = ordersById.get(payment.order_id);
    return [
      payment.id,
      payment.created_at,
      payment.order_id,
      order?.customer_name ?? "",
      order?.product_name ?? "",
      Number(payment.amount),
      paymentMethodLabels[payment.payment_method] ?? payment.payment_method,
      Number(refundedByPayment.get(payment.id) ?? 0),
      Math.max(
        0,
        Number(payment.amount) -
          Number(refundedByPayment.get(payment.id) ?? 0),
      ),
      payment.notes ?? "",
    ];
  });
  const refundRows = periodRefunds.map((refund) => {
    const order = ordersById.get(refund.order_id);
    return [
      refund.id,
      refund.created_at,
      refund.order_id,
      order?.customer_name ?? "",
      order?.product_name ?? "",
      refund.payment_id,
      refund.product_return_id ? "Devolución de producto" : "Reembolso de pago",
      refund.amount,
      paymentMethodLabels[refund.refund_method] ?? refund.refund_method,
      refund.notes ?? "",
    ];
  });
  const productReturnRows = periodReturns.map((item) => {
    const order = ordersById.get(item.order_id);
    const linkedRefund = periodRefunds
      .filter((refund) => refund.product_return_id === item.id)
      .reduce((total, refund) => total + Number(refund.amount), 0);
    return [
      item.id,
      item.created_at,
      item.order_id,
      order?.customer_name ?? "",
      order?.product_name ?? "",
      item.quantity,
      returnConditionLabels[item.item_condition] ?? item.item_condition,
      linkedRefund,
      item.notes ?? "",
    ];
  });

  if (reportType === "full" || reportType === "accounting") {
    addSheet(
      XLSX,
      workbook,
      "Pedidos",
      orderHeaders,
      orderRows,
      [
        38, 22, 22, 22, 26, 30, 12, 18, 18, 18, 18, 18, 18, 14, 18, 18, 18,
        18, 18, 18, 18, 16, 25, 24, 12,
      ],
    );
    addSheet(
      XLSX,
      workbook,
      "Abonos",
      [
        "ID abono",
        "Fecha",
        "ID pedido",
        "Cliente",
        "Producto",
        "Importe",
        "Método",
        "Reembolsado acumulado a la fecha",
        "Neto del abono",
        "Nota",
      ],
      paymentRows,
      [38, 22, 38, 26, 30, 18, 18, 18, 18, 40],
    );
    addSheet(
      XLSX,
      workbook,
      "Reembolsos",
      [
        "ID reembolso",
        "Fecha",
        "ID pedido",
        "Cliente",
        "Producto",
        "ID abono",
        "Tipo",
        "Importe",
        "Método",
        "Nota",
      ],
      refundRows,
      [38, 22, 38, 26, 30, 38, 26, 18, 18, 40],
    );
    addSheet(
      XLSX,
      workbook,
      "Productos devueltos",
      [
        "ID devolución",
        "Fecha",
        "ID pedido",
        "Cliente",
        "Producto",
        "Cantidad",
        "Estado recibido",
        "Reembolso vinculado",
        "Nota",
      ],
      productReturnRows,
      [38, 22, 38, 26, 30, 14, 24, 22, 40],
    );
  }

  if (reportType === "full" || reportType === "inventory") {
    const purchaseRows = periodMovements
      .filter((movement) => movement.movement_type === "purchase")
      .map((movement) => [
        movement.id,
        movement.created_at,
        movement.item_name,
        movement.filament_roll_id ? "Filamento" : "Hardware",
        movement.quantity,
        movement.unit,
        Number(movement.purchase_total) > 0
          ? Number(movement.purchase_total)
          : "No registrado",
        Number(movement.purchase_vat_amount) > 0
          ? Number(movement.purchase_vat_amount)
          : Number(movement.purchase_total) > 0
            ? 0
            : "No registrado",
        movement.purchase_vat_treatment === "deductible"
          ? "IVA descontable"
          : "IVA como mayor valor del costo",
        movement.notes ?? "",
      ]);
    addSheet(
      XLSX,
      workbook,
      "Compras",
      [
        "ID movimiento",
        "Fecha",
        "Artículo",
        "Tipo",
        "Cantidad",
        "Unidad",
        "Total soportado",
        "IVA soportado",
        "Tratamiento IVA",
        "Nota",
      ],
      purchaseRows,
      [38, 22, 38, 18, 16, 14, 20, 18, 34, 40],
    );

    const inventoryRows = [
      ...filamentRolls.map((roll) => [
        "Filamento",
        roll.id,
        `${roll.brand} · ${roll.material} · ${roll.color}`,
        roll.material,
        roll.color,
        Number(roll.remaining_weight_g),
        "g",
        roll.status,
        Number(roll.cost),
        roll.initial_weight_g > 0
          ? cents(
              (Number(roll.cost) * Number(roll.remaining_weight_g)) /
                Number(roll.initial_weight_g),
            )
          : 0,
        roll.supplier_id ?? "",
      ]),
      ...hardwareItems.map((item) => [
        "Hardware",
        item.id,
        item.name,
        item.category,
        "",
        Number(item.quantity),
        item.unit,
        Number(item.quantity) <= Number(item.minimum_quantity)
          ? "Bajo mínimo"
          : "Disponible",
        Number(item.cost),
        cents(Number(item.quantity) * Number(item.cost)),
        item.supplier_id ?? "",
      ]),
    ];
    addSheet(
      XLSX,
      workbook,
      "Inventario actual",
      [
        "Tipo",
        "ID artículo",
        "Artículo",
        "Categoría / material",
        "Color",
        "Cantidad disponible",
        "Unidad",
        "Estado",
        "Costo unitario",
        "Valor estimado disponible",
        "ID proveedor",
      ],
      inventoryRows,
      [16, 38, 42, 28, 20, 22, 14, 20, 20, 26, 38],
    );
    addSheet(
      XLSX,
      workbook,
      "Movimientos",
      [
        "ID movimiento",
        "Fecha",
        "Artículo",
        "Tipo de movimiento",
        "Cantidad",
        "Unidad",
        "Compra documentada",
        "IVA compra",
        "Tratamiento IVA compra",
        "Nota",
      ],
      periodMovements.map((movement) => [
        movement.id,
        movement.created_at,
        movement.item_name,
        movementLabels[movement.movement_type] ?? movement.movement_type,
        movement.quantity,
        movement.unit,
        Number(movement.purchase_total) > 0
          ? Number(movement.purchase_total)
          : "",
        Number(movement.purchase_total) > 0
          ? Number(movement.purchase_vat_amount)
          : "",
        movement.purchase_vat_treatment === "deductible"
          ? "Descontable"
          : "Mayor valor del costo",
        movement.notes ?? "",
      ]),
      [38, 22, 38, 22, 16, 14, 20, 18, 28, 40],
    );
  }

  if (reportType === "full" || reportType === "administrative") {
    addSheet(
      XLSX,
      workbook,
      "Clientes",
      [
        "ID cliente",
        "Nombre",
        "Correo",
        "Teléfono",
        "Estado autorización",
        "Fecha autorización",
        "Medio autorización",
        "Versión del aviso",
        "Registrado",
      ],
      customers.map((item) => [
        item.id,
        item.name,
        item.email ?? "",
        item.phone ?? "",
        item.privacy_consent_status === "granted"
          ? "Autorizó"
          : "No registrada",
        item.privacy_consent_at ?? "",
        item.privacy_consent_method ?? "",
        item.privacy_notice_version ?? "",
        item.created_at,
      ]),
      [38, 32, 38, 22, 22, 24, 20, 18, 22],
    );
    addSheet(
      XLSX,
      workbook,
      "Proveedores",
      ["ID proveedor", "Nombre", "Correo", "Teléfono", "Notas", "Registrado"],
      suppliers.map((item) => [
        item.id,
        item.name,
        item.email ?? "",
        item.phone ?? "",
        item.notes ?? "",
        item.created_at,
      ]),
      [38, 32, 38, 22, 48, 22],
    );
    addSheet(
      XLSX,
      workbook,
      "Catálogo",
      [
        "ID producto",
        "Nombre",
        "Categoría",
        "Material",
        "Gramos por unidad",
        "Horas impresión",
        "Horas postprocesamiento",
        "Precio base",
        "IVA específico",
        "Registrado",
      ],
      products.map((item) => [
        item.id,
        item.name,
        item.category ?? "",
        item.material ?? "",
        item.grams_per_unit,
        item.hours_per_unit,
        item.post_processing_hours_per_unit ?? 0,
        item.default_price,
        item.vat_rate ?? "",
        item.created_at,
      ]),
      [38, 34, 26, 20, 20, 18, 24, 18, 18, 22],
    );
    addSheet(
      XLSX,
      workbook,
      "Impresoras",
      [
        "ID impresora",
        "Nombre",
        "Modelo",
        "Potencia (W)",
        "Desgaste por hora",
        "Estado",
        "Registrada",
      ],
      printers.map((item) => [
        item.id,
        item.name,
        item.model ?? "",
        item.power_w,
        item.wear_per_hour,
        item.status,
        item.created_at,
      ]),
      [38, 28, 28, 18, 22, 18, 22],
    );
    addSheet(
      XLSX,
      workbook,
      "Configuración",
      ["Parámetro", "Valor"],
      [
        ["Nombre comercial", settings?.business_name ?? ""],
        ["NIT / identificación", settings?.tax_id ?? ""],
        ["Tipo de entidad", settings?.entity_type ?? ""],
        ["Responsable de IVA", settings?.is_vat_responsible ? "Sí" : "No"],
        ["Tarifa predeterminada de IVA", settings?.default_vat_rate ?? 0],
        ["Régimen", settings?.tax_regime ?? ""],
        ["Prefijo interno", settings?.invoice_prefix ?? ""],
        ["Moneda", currency],
        ["Tarifa de energía / kWh", settings?.energy_rate_per_kwh ?? 0],
        ["Potencia promedio (W)", settings?.printer_power_w ?? 0],
        ["Desgaste máquina / hora", settings?.machine_wear_per_hour ?? 0],
        ["Mano de obra / hora", settings?.labor_rate_per_hour ?? 0],
        ["Margen predeterminado (%)", settings?.default_margin_percent ?? 0],
      ],
      [38, 52],
    );
  }
}

async function downloadWorkbook(data, startDate, endDate, reportType) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  createReportSheets(XLSX, workbook, data, startDate, endDate, reportType);
  const today = new Date().toISOString().slice(0, 10);
  const fileNames = {
    full: "informe-administrativo-contable",
    accounting: "informe-contable",
    inventory: "informe-inventario-compras",
    administrative: "informe-administrativo",
  };
  XLSX.writeFile(
    workbook,
    `${fileNames[reportType]}-${today}.xlsx`,
    { compression: true },
  );
}

export default function ReportsModule() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const reportData = await getAdministrativeReportData();
      setData(reportData);
      setSettings(reportData.settings ?? defaultWorkshopSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los datos administrativos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const periodData = useMemo(() => {
    if (!data) return null;
    return {
      orders: data.orders.filter((row) =>
        isWithinDates(row, startDate, endDate),
      ),
      payments: data.payments.filter((row) =>
        isWithinDates(row, startDate, endDate),
      ),
      refunds: data.refunds.filter((row) =>
        isWithinDates(row, startDate, endDate),
      ),
      productReturns: data.productReturns.filter((row) =>
        isWithinDates(row, startDate, endDate),
      ),
      inventoryMovements: data.inventoryMovements.filter((row) =>
        isWithinDates(row, startDate, endDate),
      ),
    };
  }, [data, startDate, endDate]);

  const stats = useMemo(() => {
    if (!periodData || !data) return null;
    const delivered = periodData.orders.filter(
      (order) => order.status === "delivered",
    );
    const refundsByOrder = new Map();
    for (const refund of data.refunds) {
      refundsByOrder.set(
        refund.order_id,
        (refundsByOrder.get(refund.order_id) ?? 0) + Number(refund.amount),
      );
    }
    const productRefunds = periodData.refunds
      .filter((refund) => refund.product_return_id)
      .reduce((total, refund) => total + Number(refund.amount), 0);
    const deliveredSales = delivered.reduce(
      (total, order) => total + Number(order.sale_price),
      0,
    );
    const netRevenue = delivered.reduce(
      (total, order) =>
        total + getNetSalesBeforeVat(order, refundsByOrder.get(order.id)),
      0,
    );
    const netVat = delivered.reduce((total, order) => {
      const rate = Number(order.vat_rate) || 0;
      const refundAmount = Number(refundsByOrder.get(order.id)) || 0;
      const refundVat = rate > 0 ? cents((refundAmount * rate) / (1 + rate)) : 0;
      return total + Number(order.vat_amount || 0) - refundVat;
    }, 0);
    const totalPayments = periodData.payments.reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );
    const totalRefunds = periodData.refunds.reduce(
      (total, refund) => total + Number(refund.amount),
      0,
    );
    const expenses = periodData.inventoryMovements
      .filter(
        (movement) =>
          movement.movement_type === "purchase" &&
          Number(movement.purchase_total) > 0,
      )
      .reduce((total, movement) => total + Number(movement.purchase_total), 0);
    return {
      orderCount: periodData.orders.length,
      deliveredCount: delivered.length,
      deliveredSales,
      netRevenue,
      netVat,
      productRefunds,
      netCash: totalPayments - totalRefunds,
      expenses,
    };
  }, [data, periodData]);

  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  const dateValidationError =
    startDate && endDate && startDate > endDate
      ? "La fecha inicial no puede ser posterior a la fecha final."
      : "";
  const download = async (reportType) => {
    if (!data) return;
    if (dateValidationError) {
      setErrorMessage(dateValidationError);
      return;
    }
    setErrorMessage("");
    try {
      await downloadWorkbook(data, startDate, endDate, reportType);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `No se pudo generar el archivo Excel: ${error.message}`
          : "No se pudo generar el archivo Excel.",
      );
    }
  };

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ANÁLISIS DEL TALLER</p>
          <h1>Informes administrativos</h1>
          <p className="muted">
            Valida ingresos, impuestos, pagos, compras y existencias; descarga
            los datos en libros de Excel con hojas separadas.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          Actualizar datos
        </button>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      {dateValidationError && (
        <p className="message error" role="alert">
          {dateValidationError}
        </p>
      )}
      {loading ? (
        <div className="inventory-panel empty-state">
          <span className="spinner" />
          Cargando datos administrativos y contables…
        </div>
      ) : data && stats ? (
        <>
          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <h2>Periodo de revisión</h2>
                <p className="muted">
                  El rango filtra transacciones y pedidos por fecha de creación.
                  Recaudos y reembolsos se limitan a la fecha de cada
                  transacción; saldos y devoluciones asociadas a un pedido
                  muestran su acumulado actual. Inventario, clientes, catálogo
                  y configuración reflejan su estado actual.
                </p>
              </div>
            </div>
            <div className="field-grid report-date-filters">
              <label>
                Desde
                <input
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>
              <label>
                Hasta
                <input
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                type="button"
              >
                Todo el historial
              </button>
            </div>
          </section>
          <div className="stats-grid">
            <article className="stat-card">
              <span className="stat-icon purple">
                <FileSpreadsheet size={18} />
              </span>
              <span className="stat-label">Pedidos creados</span>
              <strong>{stats.orderCount}</strong>
              <small>{stats.deliveredCount} entregados en el periodo</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon green">
                <FileSpreadsheet size={18} />
              </span>
              <span className="stat-label">Venta neta antes de IVA</span>
              <strong>{fmt(stats.netRevenue)}</strong>
              <small>Entregas menos devoluciones de producto</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon blue">
                <FileSpreadsheet size={18} />
              </span>
              <span className="stat-label">Recaudo neto registrado</span>
              <strong>{fmt(stats.netCash)}</strong>
              <small>Abonos menos reembolsos registrados</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon purple">
                <FileSpreadsheet size={18} />
              </span>
              <span className="stat-label">Compras documentadas</span>
              <strong>{fmt(stats.expenses)}</strong>
              <small>Total de compras con importe capturado</small>
            </article>
          </div>
          <p className="message info">
            Revisión del periodo: ventas de pedidos creados en el rango,
            entregados, con IVA incluido{" "}
            <strong>{fmt(stats.deliveredSales)}</strong>; IVA neto registrado{" "}
            <strong>{fmt(stats.netVat)}</strong>; reembolsos por productos{" "}
            <strong>{fmt(stats.productRefunds)}</strong>. Estos reportes son
            auxiliares: no reemplazan libros oficiales, declaraciones ni
            documentos tributarios.
          </p>
          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <h2>Descargar libros Excel</h2>
                <p className="muted">
                  Archivos .xlsx con filtros de columnas y valores numéricos
                  editables en Excel o LibreOffice.
                </p>
              </div>
            </div>
            <div className="report-actions">
              <article>
                <div className="report-copy">
                  <strong>Informe completo</strong>
                  <small>
                    Resumen, pedidos, pagos, reembolsos, devoluciones,
                    compras, inventario y registros administrativos.
                  </small>
                </div>
                <button
                  className="button primary"
                  disabled={Boolean(dateValidationError)}
                  onClick={() => void download("full")}
                  type="button"
                >
                  <Download size={15} />
                  Descargar Excel completo
                </button>
              </article>
              <article>
                <div className="report-copy">
                  <strong>Informe contable y de caja</strong>
                  <small>
                    Pedidos entregados, subtotal/IVA, abonos, reembolsos y
                    saldos pendientes.
                  </small>
                </div>
                <button
                  className="button secondary"
                  disabled={Boolean(dateValidationError)}
                  onClick={() => void download("accounting")}
                  type="button"
                >
                  <Download size={15} />
                  Descargar informe contable
                </button>
              </article>
              <article>
                <div className="report-copy">
                  <strong>Compras e inventario</strong>
                  <small>
                    Movimientos, compras/IVA soportado, saldos actuales y
                    valoración estimada.
                  </small>
                </div>
                <button
                  className="button secondary"
                  disabled={Boolean(dateValidationError)}
                  onClick={() => void download("inventory")}
                  type="button"
                >
                  <Download size={15} />
                  Descargar informe de inventario
                </button>
              </article>
              <article>
                <div className="report-copy">
                  <strong>Informe administrativo</strong>
                  <small>
                    Datos de clientes, proveedores, productos, impresoras y
                    configuración actual.
                  </small>
                </div>
                <button
                  className="button secondary"
                  disabled={Boolean(dateValidationError)}
                  onClick={() => void download("administrative")}
                  type="button"
                >
                  <Download size={15} />
                  Descargar informe administrativo
                </button>
              </article>
            </div>
          </section>
          <p className="message info">
            Los movimientos de compra anteriores a la captura del importe
            aparecerán como “No registrado”, no como compra de valor cero. El
            IVA descontable se refleja solo cuando se registró explícitamente.
          </p>
        </>
      ) : null}
    </section>
  );
}

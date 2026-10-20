export function estimatePrintCost(
  roll,
  grams,
  hours,
  settings,
  marginPercent,
  postProcessingHours = 0,
) {
  const materialCost =
    roll && roll.initial_weight_g > 0
      ? (roll.cost / roll.initial_weight_g) * grams
      : 0;
  const energyCost =
    (settings.printer_power_w / 1000) * hours * settings.energy_rate_per_kwh;
  const machineWearCost = settings.machine_wear_per_hour * hours;
  const laborCost =
    (settings.labor_rate_per_hour ?? 0) * postProcessingHours;
  const totalCost = materialCost + energyCost + machineWearCost + laborCost;
  const suggestedPrice = totalCost * (1 + marginPercent / 100);
  const vatRate = settings.is_vat_responsible
    ? (settings.default_vat_rate ?? 0)
    : 0;
  const vatAmount = calculateVatAmount(suggestedPrice, vatRate);

  return {
    materialCost,
    energyCost,
    machineWearCost,
    laborCost,
    totalCost,
    suggestedPrice,
    vatRate,
    vatAmount,
    totalPrice: suggestedPrice + vatAmount,
  };
}

export function calculateVatAmount(subtotal, vatRate) {
  return Math.round((subtotal * vatRate + Number.EPSILON) * 100) / 100;
}

export function getEffectiveVatRate(settings, productVatRate = null) {
  if (!settings.is_vat_responsible) return 0;
  return productVatRate ?? settings.default_vat_rate;
}

export const defaultWorkshopSettings = {
  energy_rate_per_kwh: 0,
  printer_power_w: 200,
  machine_wear_per_hour: 0,
  labor_rate_per_hour: 0,
  default_margin_percent: 30,
  currency_code: "COP",
  entity_type: "NATURAL_PERSON",
  is_vat_responsible: false,
  default_vat_rate: 0.19,
  tax_regime: "NOT_APPLICABLE",
  invoice_prefix: "COT",
  business_name: "Taller de impresión 3D",
  tax_id: "",
};

export function formatCurrency(amount, currencyCode) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

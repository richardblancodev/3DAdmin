import { useEffect, useMemo, useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import {
  getPrinters,
  getWorkshopSettings,
  saveWorkshopSettings,
} from "../services/business";
import {
  defaultWorkshopSettings,
  estimatePrintCost,
  formatCurrency,
} from "../utils/business";
export default function CostCalculator({ rolls }) {
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [printers, setPrinters] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [rollId, setRollId] = useState("");
  const [printerId, setPrinterId] = useState("");
  const [grams, setGrams] = useState(50);
  const [hours, setHours] = useState(2);
  const [postProcessingHours, setPostProcessingHours] = useState(0);
  const [marginPercent, setMarginPercent] = useState(
    defaultWorkshopSettings.default_margin_percent,
  );
  useEffect(() => {
    Promise.all([getWorkshopSettings(), getPrinters()])
      .then(([value, nextPrinters]) => {
        setSettings(value);
        setMarginPercent(value.default_margin_percent);
        setPrinters(nextPrinters);
      })
      .catch((error) =>
        setSettingsError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los parámetros.",
        ),
      )
      .finally(() => setSettingsLoading(false));
  }, []);
  const selectedRoll = rolls.find((roll) => roll.id === rollId);
  const selectedPrinter = printers.find((printer) => printer.id === printerId);
  const effectiveSettings = selectedPrinter
    ? {
        ...settings,
        printer_power_w: selectedPrinter.power_w,
        machine_wear_per_hour: selectedPrinter.wear_per_hour,
      }
    : settings;
  const estimate = useMemo(
    () =>
      estimatePrintCost(
        selectedRoll,
        grams,
        hours,
        effectiveSettings,
        marginPercent,
        postProcessingHours,
      ),
    [
      selectedRoll,
      grams,
      hours,
      effectiveSettings,
      marginPercent,
      postProcessingHours,
    ],
  );
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  async function handleSettingsSubmit(event) {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsError("");
    setSettingsNotice("");
    try {
      await saveWorkshopSettings(settings);
      setMarginPercent(settings.default_margin_percent);
      setSettingsNotice("Parámetros guardados.");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los parámetros.",
      );
    } finally {
      setSettingsBusy(false);
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRECIO Y RENTABILIDAD</p>
          <h1>Costos de impresión</h1>
          <p className="muted">
            Calcula material, energía y desgaste antes de cotizar.
          </p>
        </div>
      </div>
      {settingsError && (
        <p className="message error" role="alert">
          {settingsError}
        </p>
      )}
      <div className="cost-layout">
        <section className="inventory-panel calculator-panel">
          <div className="panel-heading">
            <div>
              <h2>Calculadora</h2>
              <p className="muted">
                Estimación por pieza según el consumo y el tiempo.
              </p>
            </div>
          </div>
          <div className="calculator-fields">
            <label>
              Impresora
              <select
                value={printerId}
                onChange={(event) => setPrinterId(event.target.value)}
              >
                <option value="">Usar parámetros promedio del taller</option>
                {printers
                  .filter((printer) => printer.status !== "inactive")
                  .map((printer) => (
                    <option value={printer.id}>
                      {printer.name} · {printer.power_w} W
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Bobina de filamento
              <select
                value={rollId}
                onChange={(event) => setRollId(event.target.value)}
              >
                <option value="">Selecciona una bobina</option>
                {rolls.map((roll) => (
                  <option value={roll.id}>
                    {roll.brand} · {roll.material} · {roll.color}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <label>
                Material usado (g)
                <input
                  min="0"
                  onChange={(event) => setGrams(Number(event.target.value))}
                  step="0.1"
                  type="number"
                  value={grams}
                />
              </label>
              <label>
                Tiempo de impresión (h)
                <input
                  min="0"
                  onChange={(event) => setHours(Number(event.target.value))}
                  step="0.1"
                  type="number"
                  value={hours}
                />
              </label>
              <label>
                Postprocesamiento / mano de obra (h)
                <input
                  min="0"
                  onChange={(event) =>
                    setPostProcessingHours(Number(event.target.value))
                  }
                  step="0.1"
                  type="number"
                  value={postProcessingHours}
                />
              </label>
              <label className="span-two">
                Margen de ganancia (%)
                <input
                  min="0"
                  onChange={(event) =>
                    setMarginPercent(Number(event.target.value))
                  }
                  step="1"
                  type="number"
                  value={marginPercent}
                />
              </label>
            </div>
            {!selectedRoll && (
              <p className="message info">
                Selecciona una bobina para incluir el costo real del filamento.
              </p>
            )}
            {settings.energy_rate_per_kwh === 0 && (
              <p className="message info">
                Configura la tarifa de energía del taller para incluir el costo
                eléctrico en la cotización.
              </p>
            )}
          </div>
          <div className="estimate-list">
            <div>
              <span>Material</span>
              <strong>{fmt(estimate.materialCost)}</strong>
            </div>
            <div>
              <span>Energía</span>
              <strong>{fmt(estimate.energyCost)}</strong>
            </div>
            <div>
              <span>Desgaste de máquina</span>
              <strong>{fmt(estimate.machineWearCost)}</strong>
            </div>
            <div>
              <span>Mano de obra / postprocesamiento</span>
              <strong>{fmt(estimate.laborCost)}</strong>
            </div>
            <div className="estimate-total">
              <span>Costo estimado</span>
              <strong>{fmt(estimate.totalCost)}</strong>
            </div>
            <div className="estimate-price">
              <span>
                {settings.is_vat_responsible
                  ? "Subtotal sugerido (sin IVA)"
                  : "Precio sugerido"}
              </span>
              <strong>{fmt(estimate.suggestedPrice)}</strong>
            </div>
            {settings.is_vat_responsible && (
              <>
                <div>
                  <span>IVA ({(estimate.vatRate * 100).toFixed(2)}%)</span>
                  <strong>{fmt(estimate.vatAmount)}</strong>
                </div>
                <div className="estimate-price">
                  <span>Total sugerido con IVA</span>
                  <strong>{fmt(estimate.totalPrice)}</strong>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="inventory-panel settings-panel">
          <div className="panel-heading">
            <div>
              <span className="stat-icon purple">
                <SlidersHorizontal size={18} />
              </span>
              <h2>Parámetros del taller</h2>
              <p className="muted">
                Ajusta los valores que utiliza la calculadora.
              </p>
            </div>
          </div>
          <form className="settings-form" onSubmit={handleSettingsSubmit}>
            <label>
              Costo de energía ({settings.currency_code} / kWh)
              <input
                min="0"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    energy_rate_per_kwh: Number(event.target.value),
                  })
                }
                step="1"
                type="number"
                value={settings.energy_rate_per_kwh}
              />
            </label>
            <label>
              Consumo promedio (W)
              <input
                min="0"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    printer_power_w: Number(event.target.value),
                  })
                }
                step="1"
                type="number"
                value={settings.printer_power_w}
              />
            </label>
            <label>
              Desgaste por hora ({settings.currency_code})
              <input
                min="0"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    machine_wear_per_hour: Number(event.target.value),
                  })
                }
                step="1"
                type="number"
                value={settings.machine_wear_per_hour}
              />
            </label>
            <label>
              Mano de obra por hora ({settings.currency_code})
              <input
                min="0"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    labor_rate_per_hour: Number(event.target.value),
                  })
                }
                step="1"
                type="number"
                value={settings.labor_rate_per_hour}
              />
            </label>
            <label>
              Margen predeterminado (%)
              <input
                min="0"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    default_margin_percent: Number(event.target.value),
                  })
                }
                step="1"
                type="number"
                value={settings.default_margin_percent}
              />
            </label>
            {settingsNotice && (
              <p className="message success" role="status">
                {settingsNotice}
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={settingsBusy || settingsLoading}
              type="submit"
            >
              <Save size={16} />
              {settingsBusy ? "Guardando…" : "Guardar parámetros"}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

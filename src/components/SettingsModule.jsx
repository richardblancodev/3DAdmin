import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import {
  getWorkshopSettings,
  saveWorkshopSettings,
} from "../services/business";
import { defaultWorkshopSettings } from "../utils/business";
const supportedCurrencies = [
  {
    code: "COP",
    label: "Peso colombiano (COP)",
  },
  {
    code: "USD",
    label: "Dólar estadounidense (USD)",
  },
  {
    code: "MXN",
    label: "Peso mexicano (MXN)",
  },
  {
    code: "ARS",
    label: "Peso argentino (ARS)",
  },
  {
    code: "CLP",
    label: "Peso chileno (CLP)",
  },
  {
    code: "PEN",
    label: "Sol peruano (PEN)",
  },
  {
    code: "EUR",
    label: "Euro (EUR)",
  },
];
export default function SettingsModule() {
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    getWorkshopSettings()
      .then(setSettings)
      .catch((error) =>
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "No se pudo cargar la configuración.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const fiscalSettings = {
        ...settings,
        business_name: settings.business_name.trim(),
        invoice_prefix: settings.invoice_prefix.trim().toUpperCase(),
        tax_id: (settings.tax_id ?? "").trim(),
      };
      if (
        !Number.isFinite(fiscalSettings.default_vat_rate) ||
        fiscalSettings.default_vat_rate < 0 ||
        fiscalSettings.default_vat_rate > 1 ||
        !/^[A-Z0-9-]{2,10}$/.test(fiscalSettings.invoice_prefix)
      ) {
        throw new Error(
          "Verifica que la tarifa de IVA esté entre 0% y 100% y que el prefijo tenga 2 a 10 letras, números o guiones.",
        );
      }
      await saveWorkshopSettings(fiscalSettings);
      setSettings(fiscalSettings);
      setNotice("La configuración del taller se guardó correctamente.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCIAS</p>
          <h1>Configuración</h1>
          <p className="muted">
            Ajustes generales que usa el taller para cotizar y presentar
            importes.
          </p>
        </div>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <section className="inventory-panel settings-panel">
        <div className="panel-heading">
          <div>
            <span className="stat-icon purple">
              <Settings2 size={18} />
            </span>
            <h2>Preferencias del taller</h2>
            <p className="muted">
              Estos valores son privados para tu cuenta de usuario.
            </p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label>
            Moneda de presentación
            <select
              disabled={loading}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  currency_code: event.target.value,
                })
              }
              value={settings.currency_code}
            >
              {supportedCurrencies.map(({ code, label }) => (
                <option value={code}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Tarifa de mano de obra / postprocesamiento ({settings.currency_code} / h)
            <input
              disabled={loading}
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
          <p className="message info">
            La selección define el formato de importes en los módulos. No
            convierte valores existentes ni cambia el valor numérico guardado.
          </p>
          {notice && (
            <p className="message success" role="status">
              {notice}
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={busy || loading}
            type="submit"
          >
            <Save size={16} />
            {busy ? "Guardando…" : "Guardar configuración"}
          </button>
        </form>
      </section>
      <section className="inventory-panel settings-panel">
        <div className="panel-heading">
          <div>
            <span className="stat-icon blue">
              <Settings2 size={18} />
            </span>
            <h2>Perfil fiscal de Colombia</h2>
            <p className="muted">
              La tarifa y responsabilidad se guardan con cada nuevo pedido;
              cambiar el perfil no altera cotizaciones anteriores.
            </p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label>
            Tipo de entidad
            <select
              disabled={loading}
              onChange={(event) =>
                setSettings({ ...settings, entity_type: event.target.value })
              }
              value={settings.entity_type}
            >
              <option value="NATURAL_PERSON">Persona natural</option>
              <option value="JURIDICAL_PERSON_SAS">Persona jurídica (SAS)</option>
            </select>
          </label>
          <label>
            Razón social o nombre comercial
            <input
              disabled={loading}
              maxLength={160}
              onChange={(event) =>
                setSettings({ ...settings, business_name: event.target.value })
              }
              value={settings.business_name}
            />
          </label>
          <label>
            NIT o identificación (opcional)
            <input
              disabled={loading}
              maxLength={40}
              onChange={(event) =>
                setSettings({ ...settings, tax_id: event.target.value })
              }
              value={settings.tax_id ?? ""}
            />
          </label>
          <label>
            Régimen tributario configurado
            <select
              disabled={loading}
              onChange={(event) =>
                setSettings({ ...settings, tax_regime: event.target.value })
              }
              value={settings.tax_regime}
            >
              <option value="NOT_APPLICABLE">Sin especificar / no aplica</option>
              <option value="ORDINARY">Régimen ordinario</option>
              <option value="SIMPLE">Régimen Simple de Tributación</option>
            </select>
          </label>
          <label>
            ¿Responsable de IVA?
            <select
              disabled={loading}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  is_vat_responsible: event.target.value === "true",
                })
              }
              value={String(settings.is_vat_responsible)}
            >
              <option value="false">No (perfil actual)</option>
              <option value="true">Sí</option>
            </select>
          </label>
          <label>
            Tarifa predeterminada de IVA (%)
            <input
              disabled={loading}
              max="100"
              min="0"
              onChange={(event) =>
                setSettings({
                  ...settings,
                  default_vat_rate: Number(event.target.value) / 100,
                })
              }
              step="0.01"
              type="number"
              value={Number((settings.default_vat_rate * 100).toFixed(2))}
            />
          </label>
          <label>
            Prefijo para cotizaciones
            <input
              disabled={loading}
              maxLength={10}
              minLength={2}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  invoice_prefix: event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9-]/g, ""),
                })
              }
              value={settings.invoice_prefix}
            />
          </label>
          <p className="message info">
            El perfil actual deja el IVA en 0% y lo considera incluido en los
            costos de compra. La tarifa predeterminada del 19% queda preparada
            para activarse manualmente al cambiar tu situación tributaria; la
            app no cambiará el perfil automáticamente en 2027. Confirma tus
            responsabilidades y fechas con un contador.
          </p>
          <p className="message info">
            Las cotizaciones que se imprimen desde el módulo fiscal son
            documentos internos y no son factura electrónica DIAN ni documento
            equivalente validado. El prefijo no es una numeración autorizada.
          </p>
          {notice && (
            <p className="message success" role="status">
              {notice}
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={busy || loading}
            type="submit"
          >
            <Save size={16} />
            {busy ? "Guardando…" : "Guardar perfil fiscal"}
          </button>
        </form>
      </section>
    </section>
  );
}

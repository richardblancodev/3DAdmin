import { useCallback, useEffect, useState } from "react";
import { Pencil, Printer, Plus, Wrench } from "lucide-react";
import {
  createPrinter,
  getPrinters,
  updatePrinter,
  updatePrinterStatus,
} from "../services/business";
import { getWorkshopSettings } from "../services/business";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";
const statusLabels = {
  available: "Disponible",
  printing: "Imprimiendo",
  maintenance: "Mantenimiento",
  inactive: "Inactiva",
};
export default function PrintersModule() {
  const [printers, setPrinters] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextPrinters, nextSettings] = await Promise.all([
        getPrinters(),
        getWorkshopSettings(),
      ]);
      setPrinters(nextPrinters);
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las impresoras.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name")).trim(),
      model: String(form.get("model")).trim(),
      power_w: Number(form.get("power_w")),
      wear_per_hour: Number(form.get("wear_per_hour")),
      notes: String(form.get("notes")).trim(),
    };
    setBusy(true);
    setErrorMessage("");
    try {
      if (editing) await updatePrinter(editing.id, input);
      else await createPrinter(input);
      setShowForm(false);
      setEditing(null);
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la impresora.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleStatusChange(id, status) {
    try {
      await updatePrinterStatus(id, status);
      setPrinters((current) =>
        current.map((printer) =>
          printer.id === id
            ? {
                ...printer,
                status,
              }
            : printer,
        ),
      );
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el estado.",
      );
    }
  }
  function startEdit(printer) {
    setEditing(printer);
    setShowForm(true);
  }
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EQUIPOS DEL TALLER</p>
          <h1>Impresoras</h1>
          <p className="muted">
            Mantén potencias y desgaste por equipo para cotizar con precisión.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus size={17} />
          Agregar impresora
        </button>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>Equipos registrados</h2>
            <p className="muted">
              Los valores de potencia y desgaste se utilizan en las
              estimaciones.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando impresoras…
          </div>
        ) : printers.length === 0 ? (
          <div className="empty-state">
            <Printer size={30} />
            <strong>Aún no hay impresoras</strong>
            <span>Registra el modelo y sus parámetros de funcionamiento.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Impresora</th>
                  <th>Consumo</th>
                  <th>Desgaste / hora</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {printers.map((printer) => (
                  <tr>
                    <td>
                      <div className="product-cell">
                        <span className="product-icon">
                          <Printer size={17} />
                        </span>
                        <span>
                          <strong>{printer.name}</strong>
                          <small>
                            {printer.model || "Modelo sin especificar"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{printer.power_w} W</td>
                    <td>{fmt(printer.wear_per_hour)}</td>
                    <td>
                      <select
                        aria-label={`Estado de ${printer.name}`}
                        className={`status-select ${printer.status}`}
                        onChange={(event) => {
                          void handleStatusChange(
                            printer.id,
                            event.target.value,
                          );
                        }}
                        value={printer.status}
                      >
                        {Object.keys(statusLabels).map((status) => (
                          <option value={status}>{statusLabels[status]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        aria-label={`Editar ${printer.name}`}
                        className="icon-button"
                        onClick={() => startEdit(printer)}
                        type="button"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowForm(false);
              setEditing(null);
            }
          }}
        >
          <section
            aria-labelledby="printer-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">EQUIPO</p>
                <h2 id="printer-title">
                  {editing ? "Editar impresora" : "Agregar impresora"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
              <div className="field-grid">
                <label>
                  Nombre
                  <input
                    autoFocus
                    defaultValue={editing?.name ?? ""}
                    maxLength={120}
                    name="name"
                    placeholder="Ej. Sparkx i7"
                    required
                  />
                </label>
                <label>
                  Modelo
                  <input
                    defaultValue={editing?.model ?? ""}
                    maxLength={120}
                    name="model"
                    placeholder="Modelo o variante"
                  />
                </label>
                <label>
                  Consumo promedio (W)
                  <input
                    defaultValue={editing?.power_w ?? 200}
                    min="0"
                    name="power_w"
                    required
                    step="1"
                    type="number"
                  />
                </label>
                <label>
                  Desgaste por hora ({settings.currency_code})
                  <input
                    defaultValue={editing?.wear_per_hour ?? 0}
                    min="0"
                    name="wear_per_hour"
                    required
                    step="1"
                    type="number"
                  />
                </label>
                <label className="span-two">
                  Notas
                  <input
                    defaultValue={editing?.notes ?? ""}
                    maxLength={500}
                    name="notes"
                  />
                </label>
              </div>
              <p className="message info">
                <Wrench size={14} /> Se usa el consumo real estimado y costo de
                desgaste de este equipo al cotizar.
              </p>
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Guardando…" : "Guardar impresora"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import {
  createCustomer,
  deleteCustomer,
  getCustomers,
  updateCustomer,
} from "../services/business";
const emptyForm = {
  name: "",
  email: "",
  phone: "",
  privacyConsent: false,
  privacyConsentMethod: "written",
};

const consentMethodLabels = {
  written: "Escrita",
  verbal: "Verbal",
  digital: "Digital",
  other: "Otro medio",
};

export default function CustomersModule() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setCustomers(await getCustomers());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los clientes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }
  function startEdit(customer) {
    setEditing(customer);
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      privacyConsent: customer.privacy_consent_status === "granted",
      privacyConsentMethod: customer.privacy_consent_method ?? "written",
    });
    setShowForm(true);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    try {
      if (!form.privacyConsent) {
        setErrorMessage(
          "Para guardar los datos en el directorio debes confirmar que el cliente autorizó su tratamiento.",
        );
        return;
      }
      const customerData = {
        ...form,
        privacy_consent_method: form.privacyConsentMethod,
      };
      if (editing) await updateCustomer(editing.id, customerData);
      else await createCustomer(customerData);
      setShowForm(false);
      setEditing(null);
      await refresh();
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
  async function handleDelete(customer) {
    if (!window.confirm(`¿Eliminar al cliente "${customer.name}"?`)) return;
    setErrorMessage("");
    try {
      await deleteCustomer(customer.id);
      setCustomers((current) =>
        current.filter((item) => item.id !== customer.id),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el cliente.",
      );
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELACIONES COMERCIALES</p>
          <h1>Clientes</h1>
          <p className="muted">Administra contactos asociados a pedidos.</p>
        </div>
        <button className="button primary" onClick={startCreate}>
          <Plus size={17} />
          Nuevo cliente
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
            <h2>Directorio de clientes</h2>
            <p className="muted">
              Los registros antiguos sin autorización registrada requieren
              confirmación antes de reutilizarse en nuevos pedidos.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando clientes…
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <UserRound size={30} />
            <strong>Sin clientes registrados</strong>
            <span>
              Agrega un cliente desde aquí o directamente al crear un pedido.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Autorización de datos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.email || "—"}</td>
                    <td>{customer.phone || "—"}</td>
                    <td>
                      {customer.privacy_consent_status === "granted"
                        ? `Autorizó · ${consentMethodLabels[customer.privacy_consent_method] ?? "Registrada"}`
                        : "Pendiente de autorización"}
                      {customer.privacy_consent_at && (
                        <small className="consent-date">
                          {new Date(
                            customer.privacy_consent_at,
                          ).toLocaleString("es-CO")}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Editar ${customer.name}`}
                          className="icon-button"
                          onClick={() => startEdit(customer)}
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`Eliminar ${customer.name}`}
                          className="icon-button danger-icon"
                          onClick={() => {
                            void handleDelete(customer);
                          }}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
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
            if (event.target === event.currentTarget) setShowForm(false);
          }}
        >
          <section
            aria-labelledby="customer-form-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CLIENTES</p>
                <h2 id="customer-form-title">
                  {editing ? "Editar cliente" : "Nuevo cliente"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setShowForm(false)}
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
              <p className="message info">
                Guarda solo los datos necesarios. Antes de continuar, informa
                al cliente para qué se usarán y confirma su autorización. Esta
                versión registra nombre, correo y teléfono para cotizaciones,
                pedidos y comunicaciones relacionadas.
              </p>
              <label>
                Nombre
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  required
                  value={form.name}
                />
              </label>
              <label>
                Correo electrónico
                <input
                  autoComplete="email"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                  type="email"
                  value={form.email}
                />
              </label>
              <label>
                Teléfono
                <input
                  autoComplete="tel"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phone: event.target.value,
                    })
                  }
                  value={form.phone}
                />
              </label>
              <label className="checkbox-field">
                <input
                  checked={form.privacyConsent}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      privacyConsent: event.target.checked,
                    })
                  }
                  required
                  type="checkbox"
                />
                Confirmo que el cliente autorizó el tratamiento de estos datos
                y recibió la información sobre su uso.
              </label>
              <label>
                Medio por el que se obtuvo la autorización
                <select
                  onChange={(event) =>
                    setForm({
                      ...form,
                      privacyConsentMethod: event.target.value,
                    })
                  }
                  required
                  value={form.privacyConsentMethod}
                >
                  {Object.entries(consentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowForm(false)}
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

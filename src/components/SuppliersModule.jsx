import { useCallback, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteSupplier,
  getSuppliers,
  saveSupplier,
} from "../services/suppliers";
const emptySupplier = {
  name: "",
  email: "",
  phone: "",
  notes: "",
};
export default function SuppliersModule() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptySupplier);
  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setSuppliers(await getSuppliers());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los proveedores.",
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
    setForm(emptySupplier);
    setShowForm(true);
    setErrorMessage("");
  }
  function startEdit(supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      notes: supplier.notes ?? "",
    });
    setErrorMessage("");
    setShowForm(true);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    try {
      await saveSupplier(form, editing?.id);
      setEditing(null);
      setShowForm(false);
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el proveedor.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleDelete(supplier) {
    if (!window.confirm(`¿Eliminar el proveedor "${supplier.name}"?`)) return;
    try {
      await deleteSupplier(supplier.id);
      setSuppliers((current) =>
        current.filter((item) => item.id !== supplier.id),
      );
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el proveedor.",
      );
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPRAS Y ABASTECIMIENTO</p>
          <h1>Proveedores</h1>
          <p className="muted">
            Mantén a mano los contactos de tus proveedores.
          </p>
        </div>
        <button className="button primary" onClick={startCreate}>
          <Plus size={17} />
          Nuevo proveedor
        </button>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      {showForm && (
        <section className="inventory-panel compact-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <p className="muted">
                Los datos se guardan de forma privada para tu cuenta.
              </p>
            </div>
          </div>
          <form
            className="settings-form"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <div className="field-grid">
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
                Correo
                <input
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
                  onChange={(event) =>
                    setForm({
                      ...form,
                      phone: event.target.value,
                    })
                  }
                  value={form.phone}
                />
              </label>
              <label>
                Notas
                <input
                  maxLength={500}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notes: event.target.value,
                    })
                  }
                  value={form.notes}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(emptySupplier);
                  setShowForm(false);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy} type="submit">
                {busy ? "Guardando…" : "Guardar proveedor"}
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>Directorio</h2>
            <p className="muted">Proveedores vinculados a tu inventario.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando proveedores…
          </div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">
            <Building2 size={30} />
            <strong>Sin proveedores</strong>
            <span>Agrega un contacto para asociarlo a tus compras.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Notas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{supplier.email || "—"}</td>
                    <td>{supplier.phone || "—"}</td>
                    <td>{supplier.notes || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Editar ${supplier.name}`}
                          className="icon-button"
                          onClick={() => startEdit(supplier)}
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`Eliminar ${supplier.name}`}
                          className="icon-button danger-icon"
                          onClick={() => {
                            void handleDelete(supplier);
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
    </section>
  );
}

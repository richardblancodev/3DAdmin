import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createProduct,
  deleteProduct,
  getProducts,
} from "../services/business";
import { getWorkshopSettings, updateProduct } from "../services/business";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";
export default function CatalogModule() {
  const [products, setProducts] = useState([]);
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
      const [nextProducts, nextSettings] = await Promise.all([
        getProducts(),
        getWorkshopSettings(),
      ]);
      setProducts(nextProducts);
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el catálogo.",
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
      category: String(form.get("category")).trim(),
      description: String(form.get("description")).trim(),
      material: String(form.get("material")).trim(),
      grams_per_unit: Number(form.get("grams_per_unit")),
      hours_per_unit: Number(form.get("hours_per_unit")),
      post_processing_hours_per_unit: Number(
        form.get("post_processing_hours_per_unit"),
      ),
      default_price: Number(form.get("default_price")),
      vat_rate:
        form.get("vat_rate") === ""
          ? null
          : Number(form.get("vat_rate")) / 100,
    };
    setBusy(true);
    setErrorMessage("");
    try {
      if (editing) await updateProduct(editing.id, input);
      else await createProduct(input);
      setShowForm(false);
      setEditing(null);
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setBusy(false);
    }
  }
  function startEdit(product) {
    setEditing(product);
    setShowForm(true);
  }
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  async function handleDelete(product) {
    if (
      !window.confirm(
        `¿Eliminar "${product.name}" del catálogo? No se puede eliminar si ya está asociado a un pedido.`,
      )
    )
      return;
    setErrorMessage("");
    try {
      await deleteProduct(product.id);
      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el producto.",
      );
    }
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUCTOS Y COLECCIONES</p>
          <h1>Catálogo</h1>
          <p className="muted">
            Guarda parámetros habituales para cotizar pedidos rápidamente.
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
          Nuevo producto
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
            <h2>Productos registrados</h2>
            <p className="muted">
              Los gramos, horas y precio base se copian al pedido como valores
              iniciales.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando catálogo…
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={30} />
            <strong>Catálogo vacío</strong>
            <span>Registra productos personalizados o de tus colecciones.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Material</th>
                  <th>Consumo / unidad</th>
                  <th>Tiempo / unidad</th>
                  <th>IVA</th>
                  <th>Precio base</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr>
                    <td>
                      <div className="product-cell">
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.category ||
                              product.description ||
                              "Sin categoría"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{product.material || "—"}</td>
                    <td>{product.grams_per_unit} g</td>
                    <td>{product.hours_per_unit} h</td>
                    <td>
                      {product.vat_rate == null
                        ? `Predeterminado (${(settings.default_vat_rate * 100).toFixed(0)}%)`
                        : `${(product.vat_rate * 100).toFixed(2)}%`}
                    </td>
                    <td>{fmt(product.default_price)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Editar ${product.name}`}
                          className="icon-button"
                          onClick={() => startEdit(product)}
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`Eliminar ${product.name}`}
                          className="icon-button danger-icon"
                          onClick={() => {
                            void handleDelete(product);
                          }}
                          type="button"
                        >
                          <Trash2 size={16} />
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
            if (event.target === event.currentTarget) {
              setShowForm(false);
              setEditing(null);
            }
          }}
        >
          <section
            aria-labelledby="product-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CATÁLOGO</p>
                <h2 id="product-title">
                  {editing ? "Editar producto" : "Nuevo producto"}
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
                <label className="span-two">
                  Nombre
                  <input
                    autoFocus
                    defaultValue={editing?.name ?? ""}
                    maxLength={160}
                    name="name"
                    required
                  />
                </label>
                <label>
                  Colección / categoría
                  <input
                    defaultValue={editing?.category ?? ""}
                    maxLength={100}
                    name="category"
                    placeholder="Ej. Decoración"
                  />
                </label>
                <label>
                  Material
                  <input
                    defaultValue={editing?.material ?? ""}
                    maxLength={80}
                    name="material"
                    placeholder="PLA, PETG…"
                  />
                </label>
                <label>
                  Material por unidad (g)
                  <input
                    defaultValue={editing?.grams_per_unit ?? 0}
                    min="0"
                    name="grams_per_unit"
                    required
                    step="0.1"
                    type="number"
                  />
                </label>
                <label>
                  Tiempo por unidad (h)
                  <input
                    defaultValue={editing?.hours_per_unit ?? 0}
                    min="0"
                    name="hours_per_unit"
                    required
                    step="0.1"
                    type="number"
                  />
                </label>
                <label>
                  Postprocesamiento / mano de obra (h)
                  <input
                    defaultValue={editing?.post_processing_hours_per_unit ?? 0}
                    min="0"
                    name="post_processing_hours_per_unit"
                    required
                    step="0.1"
                    type="number"
                  />
                </label>
                <label>
                  IVA del producto (%; vacío = predeterminado)
                  <input
                    defaultValue={
                      editing?.vat_rate == null
                        ? ""
                        : Number((editing.vat_rate * 100).toFixed(2))
                    }
                    max="100"
                    min="0"
                    name="vat_rate"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="span-two">
                  Precio base sugerido ({settings.currency_code})
                  <input
                    defaultValue={editing?.default_price ?? 0}
                    min="0"
                    name="default_price"
                    required
                    step="1"
                    type="number"
                  />
                </label>
                <label className="span-two">
                  Descripción
                  <input
                    defaultValue={editing?.description ?? ""}
                    maxLength={500}
                    name="description"
                  />
                </label>
              </div>
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
                  {busy ? "Guardando…" : "Guardar producto"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

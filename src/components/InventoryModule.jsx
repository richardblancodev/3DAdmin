import { useCallback, useEffect, useState } from "react";
import {
  History,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";
import FilamentForm from "./FilamentForm";
import FilamentTable from "./FilamentTable";
import { getWorkshopSettings } from "../services/business";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";
import {
  createHardwareItem,
  getHardwareItems,
  getInventoryMovements,
  recordInventoryMovement,
  updateHardwareItem,
} from "../services/inventoryManagement";
import { getSuppliers } from "../services/suppliers";
export default function InventoryModule({
  rolls,
  loadingRolls,
  onRollsChanged,
}) {
  const [tab, setTab] = useState("filament");
  const [hardware, setHardware] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showFilamentForm, setShowFilamentForm] = useState(false);
  const [showHardwareForm, setShowHardwareForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [stockTarget, setStockTarget] = useState("filament");
  const [movementType, setMovementType] = useState("purchase");
  const [purchaseVatTreatment, setPurchaseVatTreatment] = useState(
    "included_in_cost",
  );
  const [editingHardware, setEditingHardware] = useState(null);
  const [editingRoll, setEditingRoll] = useState(null);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [filamentSearch, setFilamentSearch] = useState("");
  const refreshHardware = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [items, workshopSettings, supplierList] = await Promise.all([
        getHardwareItems(),
        getWorkshopSettings(),
        getSuppliers(),
      ]);
      setHardware(items);
      setSettings(workshopSettings);
      setPurchaseVatTreatment(
        workshopSettings.is_vat_responsible
          ? "deductible"
          : "included_in_cost",
      );
      setSuppliers(supplierList);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el inventario de accesorios.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshMovements = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setMovements(await getInventoryMovements());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el historial.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshHardware();
    if (tab === "movements") void refreshMovements();
  }, [tab, refreshHardware, refreshMovements]);
  async function handleHardwareSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity"));
    const purchaseVatTreatment = String(
      form.get("purchase_vat_treatment") || "included_in_cost",
    );
    const purchaseVatAmount = Number(form.get("purchase_vat_amount") || 0);
    const purchaseTotal =
      quantity > 0
        ? Number(
            form.get("purchase_total") ||
              Number(form.get("cost")) * quantity,
          )
        : 0;
    const effectivePurchaseVatTreatment =
      quantity > 0 ? purchaseVatTreatment : "included_in_cost";
    if (
      !editingHardware &&
      (purchaseVatAmount < 0 ||
        purchaseVatAmount > purchaseTotal ||
        (effectivePurchaseVatTreatment === "deductible" &&
          (!settings.is_vat_responsible ||
            purchaseVatAmount > purchaseTotal)))
    ) {
      setErrorMessage(
        "Verifica el total y el IVA de compra; el IVA descontable requiere un perfil responsable y costo neto no negativo.",
      );
      return;
    }
    const input = {
      name: String(form.get("name")).trim(),
      category: String(form.get("category")).trim(),
      quantity,
      unit: String(form.get("unit")).trim(),
      minimum_quantity: Number(form.get("minimum_quantity")),
      cost:
        !editingHardware && effectivePurchaseVatTreatment === "deductible"
          ? (purchaseTotal - purchaseVatAmount) / quantity
          : Number(form.get("cost")),
      notes: String(form.get("notes")).trim(),
      supplier_id: String(form.get("supplier_id")) || null,
      purchase_total: !editingHardware ? purchaseTotal : 0,
      purchase_vat_amount: !editingHardware ? purchaseVatAmount : 0,
      purchase_vat_treatment: !editingHardware
        ? effectivePurchaseVatTreatment
        : "included_in_cost",
    };
    setLoading(true);
    setErrorMessage("");
    try {
      if (editingHardware) {
        await updateHardwareItem(editingHardware.id, {
          name: input.name,
          category: input.category,
          minimum_quantity: input.minimum_quantity,
          cost: input.cost,
          notes: input.notes,
          supplier_id: input.supplier_id,
        });
      } else {
        await createHardwareItem(input);
      }
      setEditingHardware(null);
      setShowHardwareForm(false);
      await refreshHardware();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el artículo.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function handleMovementSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = String(form.get("target"));
    const itemId = String(form.get("item_id"));
    const type = String(form.get("movement_type"));
    const quantity = Number(form.get("quantity"));
    const purchaseTotal = Number(form.get("purchase_total") || 0);
    const purchaseVatAmount = Number(form.get("purchase_vat_amount") || 0);
    const treatment = String(form.get("purchase_vat_treatment"));
    if (!itemId) {
      setErrorMessage("Selecciona un artículo para registrar el movimiento.");
      return;
    }
    if (
      type === "purchase" &&
      (purchaseTotal < 0 ||
        purchaseVatAmount < 0 ||
        purchaseVatAmount > purchaseTotal)
    ) {
      setErrorMessage(
        "El IVA registrado no puede ser negativo ni superar el total de la compra.",
      );
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      await recordInventoryMovement({
        filamentRollId: target === "filament" ? itemId : null,
        hardwareItemId: target === "hardware" ? itemId : null,
        type,
        purchaseTotal: type === "purchase" ? purchaseTotal : 0,
        purchaseVatAmount: type === "purchase" ? purchaseVatAmount : 0,
        purchaseVatTreatment:
          type === "purchase" ? treatment : "included_in_cost",
        quantity:
          type === "adjustment" &&
          form.get("adjustment_direction") === "subtract"
            ? -quantity
            : quantity,
        notes: String(form.get("notes")).trim(),
      });
      await Promise.all([
        onRollsChanged(),
        refreshHardware(),
        refreshMovements(),
      ]);
      setShowMovementForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el movimiento.",
      );
    } finally {
      setLoading(false);
    }
  }
  const tabLabels = {
    filament: "Filamentos",
    hardware: "Hardware y accesorios",
    movements: "Movimientos",
  };
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  const filteredRolls = rolls.filter((roll) =>
    `${roll.brand} ${roll.material} ${roll.color}`
      .toLowerCase()
      .includes(filamentSearch.trim().toLowerCase()),
  );
  const supplierNames = Object.fromEntries(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROL DE INSUMOS</p>
          <h1>Inventario</h1>
          <p className="muted">
            Controla materiales, equipos y movimientos de stock.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() => setShowMovementForm(true)}
          >
            <RotateCcw size={16} />
            Registrar movimiento
          </button>
          {tab === "filament" && (
            <button
              className="button primary"
              onClick={() => setShowFilamentForm(true)}
            >
              <Plus size={17} />
              Agregar bobina
            </button>
          )}
          {tab === "hardware" && (
            <button
              className="button primary"
              onClick={() => setShowHardwareForm(true)}
            >
              <Plus size={17} />
              Agregar artículo
            </button>
          )}
        </div>
      </div>
      <div
        className="inventory-tabs"
        role="tablist"
        aria-label="Secciones de inventario"
      >
        {Object.keys(tabLabels).map((item) => (
          <button
            aria-selected={tab === item}
            className={tab === item ? "selected" : ""}
            onClick={() => setTab(item)}
            role="tab"
            type="button"
          >
            {tabLabels[item]}
          </button>
        ))}
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      {tab === "filament" && (
        <section className="inventory-panel">
          <div className="panel-heading">
            <div>
              <h2>Bobinas de filamento</h2>
              <p className="muted">
                Saldo actualizado por compras, consumo y ajustes.
              </p>
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Buscar bobinas"
                onChange={(event) => setFilamentSearch(event.target.value)}
                placeholder="Buscar..."
                value={filamentSearch}
              />
            </label>
          </div>
          <FilamentTable
            currencyCode={settings.currency_code}
            loading={loadingRolls}
            onEdit={setEditingRoll}
            rolls={filteredRolls}
            supplierNames={supplierNames}
          />
        </section>
      )}
      {tab === "hardware" && (
        <section className="inventory-panel">
          <div className="panel-heading">
            <div>
              <h2>Hardware y accesorios</h2>
              <p className="muted">
                Impresoras, repuestos, herramientas y consumibles.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <span className="spinner" />
              Cargando artículos…
            </div>
          ) : hardware.length === 0 ? (
            <div className="empty-state">
              <Wrench size={30} />
              <strong>Aún no hay accesorios</strong>
              <span>Agrega el equipo, repuesto o herramienta del taller.</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Categoría</th>
                    <th>Existencias</th>
                    <th>Costo / unidad</th>
                    <th>Proveedor</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {hardware.map((item) => {
                    const lowStock = item.quantity <= item.minimum_quantity;
                    return (
                      <tr>
                        <td>
                          <div className="product-cell">
                            <span className="product-icon">
                              <Wrench size={17} />
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.notes || item.unit}</small>
                            </span>
                          </div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          {item.quantity} {item.unit}
                        </td>
                        <td>{fmt(item.cost)}</td>
                        <td>
                          {item.supplier_id
                            ? (supplierNames[item.supplier_id] ??
                              "Proveedor no disponible")
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`stock-badge ${lowStock ? "low" : "ok"}`}
                          >
                            {lowStock ? "Stock bajo" : "Disponible"}
                          </span>
                        </td>
                        <td>
                          <button
                            aria-label={`Editar ${item.name}`}
                            className="icon-button"
                            onClick={() => {
                              setEditingHardware(item);
                              setShowHardwareForm(true);
                            }}
                            type="button"
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "movements" && (
        <section className="inventory-panel">
          <div className="panel-heading">
            <div>
              <h2>Historial de movimientos</h2>
              <p className="muted">
                Últimos 100 movimientos de filamentos y hardware.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <span className="spinner" />
              Cargando movimientos…
            </div>
          ) : movements.length === 0 ? (
            <div className="empty-state">
              <History size={30} />
              <strong>Sin movimientos registrados</strong>
              <span>Las entradas, consumos y ajustes aparecerán aquí.</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Artículo</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Compra / IVA</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr>
                      <td>
                        {new Date(movement.created_at).toLocaleString("es-CO")}
                      </td>
                      <td>
                        <strong>{movement.item_name}</strong>
                      </td>
                      <td>
                        <span
                          className={`movement-badge ${movement.movement_type}`}
                        >
                          {movement.movement_type === "purchase"
                            ? "Compra"
                            : movement.movement_type === "consumption"
                              ? "Consumo"
                              : "Ajuste"}
                        </span>
                      </td>
                      <td>
                        {movement.quantity > 0 ? "+" : ""}
                        {movement.quantity} {movement.unit}
                      </td>
                      <td>
                        {movement.movement_type === "purchase" &&
                        movement.purchase_total > 0
                          ? `${fmt(movement.purchase_total)} · IVA ${fmt(movement.purchase_vat_amount)} (${movement.purchase_vat_treatment === "deductible" ? "descontable" : "mayor costo"})`
                          : "—"}
                      </td>
                      <td>{movement.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {(showFilamentForm || editingRoll) && (
        <FilamentForm
          onClose={() => {
            setShowFilamentForm(false);
            setEditingRoll(null);
          }}
          onSaved={onRollsChanged}
          roll={editingRoll ?? undefined}
          fiscalSettings={settings}
          suppliers={suppliers}
        />
      )}
      {showHardwareForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowHardwareForm(false);
              setEditingHardware(null);
            }
          }}
        >
          <section
            aria-labelledby="hardware-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">INVENTARIO</p>
                <h2 id="hardware-title">
                  {editingHardware ? "Editar artículo" : "Agregar artículo"}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => {
                  setShowHardwareForm(false);
                  setEditingHardware(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                void handleHardwareSubmit(event);
              }}
            >
              <div className="field-grid">
                <label>
                  Nombre
                  <input
                    autoFocus
                    defaultValue={editingHardware?.name ?? ""}
                    maxLength={160}
                    name="name"
                    placeholder="Ej. Sparkx i7"
                    required
                  />
                </label>
                <label>
                  Categoría
                  <input
                    defaultValue={editingHardware?.category ?? ""}
                    maxLength={80}
                    name="category"
                    placeholder="Impresora, herramienta…"
                    required
                  />
                </label>
                {!editingHardware && (
                  <label>
                    Cantidad inicial
                    <input
                      defaultValue="1"
                      min="0"
                      name="quantity"
                      required
                      step="0.01"
                      type="number"
                    />
                  </label>
                )}
                {!editingHardware && (
                  <label>
                    Unidad
                    <input
                      defaultValue="unidad"
                      maxLength={30}
                      name="unit"
                      required
                    />
                  </label>
                )}
                <label>
                  Stock mínimo
                  <input
                    defaultValue={editingHardware?.minimum_quantity ?? 0}
                    min="0"
                    name="minimum_quantity"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  {editingHardware
                    ? "Costo neto / unidad"
                    : "Costo facturado / unidad"}
                  <input
                    defaultValue={editingHardware?.cost ?? 0}
                    min="0"
                    name="cost"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                {!editingHardware && (
                  <>
                    <label>
                      Total de factura ({settings.currency_code})
                      <input
                        defaultValue=""
                        min="0"
                        name="purchase_total"
                        placeholder="Se estima con costo × cantidad"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label>
                      IVA de la compra ({settings.currency_code})
                      <input
                        defaultValue="0"
                        min="0"
                        name="purchase_vat_amount"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label className="span-two">
                      Tratamiento del IVA
                      <select
                        defaultValue={
                          settings.is_vat_responsible
                            ? "deductible"
                            : "included_in_cost"
                        }
                        name="purchase_vat_treatment"
                      >
                        <option value="included_in_cost">
                          Mayor valor del costo
                        </option>
                        <option
                          disabled={!settings.is_vat_responsible}
                          value="deductible"
                        >
                          IVA descontable
                        </option>
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Proveedor
                  <select
                    defaultValue={editingHardware?.supplier_id ?? ""}
                    name="supplier_id"
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier) => (
                      <option value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </label>
                <label className="span-two">
                  Notas
                  <input
                    defaultValue={editingHardware?.notes ?? ""}
                    maxLength={500}
                    name="notes"
                  />
                </label>
              </div>
              {!editingHardware && (
                <p className="message info">
                  La cantidad inicial se registra como compra para mantener el
                  historial. Si el IVA es descontable, el valor por unidad se
                  guarda sin la parte de IVA que indiques.
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setShowHardwareForm(false);
                    setEditingHardware(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={loading}
                  type="submit"
                >
                  <PackagePlus size={15} />
                  {editingHardware ? "Guardar cambios" : "Guardar artículo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showMovementForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShowMovementForm(false);
          }}
        >
          <section
            aria-labelledby="movement-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">STOCK</p>
                <h2 id="movement-title">Registrar movimiento</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="icon-button"
                onClick={() => setShowMovementForm(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                void handleMovementSubmit(event);
              }}
            >
              <label>
                Tipo de artículo
                <select
                  onChange={(event) => setStockTarget(event.target.value)}
                  value={stockTarget}
                >
                  <option value="filament">Filamento</option>
                  <option value="hardware">Hardware / accesorio</option>
                </select>
              </label>
              <label>
                Artículo
                <select defaultValue="" name="item_id" required>
                  <option value="">Selecciona un artículo</option>
                  {stockTarget === "filament"
                    ? rolls.map((roll) => (
                        <option value={roll.id}>
                          {roll.brand} · {roll.material} · {roll.color} (
                          {roll.remaining_weight_g} g)
                        </option>
                      ))
                    : hardware.map((item) => (
                        <option value={item.id}>
                          {item.name} ({item.quantity} {item.unit})
                        </option>
                      ))}
                </select>
              </label>
              <input name="target" type="hidden" value={stockTarget} />
              <label>
                Movimiento
                <select
                  onChange={(event) => setMovementType(event.target.value)}
                  value={movementType}
                  name="movement_type"
                >
                  <option value="purchase">Compra / entrada</option>
                  <option value="consumption">Consumo / salida</option>
                  <option value="adjustment">Ajuste de stock</option>
                </select>
              </label>
              <label>
                Dirección del ajuste (solo ajuste)
                <select defaultValue="add" name="adjustment_direction">
                  <option value="add">Aumentar</option>
                  <option value="subtract">Disminuir</option>
                </select>
              </label>
              <label>
                Cantidad
                <input
                  min="0.01"
                  name="quantity"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              {movementType === "purchase" && (
                <>
                  <label>
                    Total de la compra ({settings.currency_code}; referencia)
                    <input
                      defaultValue="0"
                      min="0"
                      name="purchase_total"
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label>
                    IVA de la factura ({settings.currency_code}; referencia)
                    <input
                      defaultValue="0"
                      min="0"
                      name="purchase_vat_amount"
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label>
                    Tratamiento del IVA soportado
                    <select
                      onChange={(event) =>
                        setPurchaseVatTreatment(event.target.value)
                      }
                      value={purchaseVatTreatment}
                      name="purchase_vat_treatment"
                    >
                      <option value="included_in_cost">
                        Mayor valor del costo
                      </option>
                      <option
                        disabled={!settings.is_vat_responsible}
                        value="deductible"
                      >
                        IVA descontable (perfil responsable de IVA)
                      </option>
                    </select>
                  </label>
                  <p className="message info">
                    Estos valores registran el soporte tributario de la compra.
                    No recalculan automáticamente el costo unitario ya guardado
                    en la bobina o el artículo.
                  </p>
                </>
              )}
              <label>
                Nota
                <input maxLength={500} name="notes" />
              </label>
              {errorMessage && (
                <p className="message error" role="alert">
                  {errorMessage}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowMovementForm(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={loading}
                  type="submit"
                >
                  Aplicar movimiento
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { X } from "lucide-react";
import { createFilamentRoll, updateFilamentRoll } from "../services/inventory";
const materials = ["PLA", "PETG", "ABS", "TPU", "ASA", "OTHER"];
export default function FilamentForm({
  onClose,
  onSaved,
  roll,
  suppliers,
  fiscalSettings,
}) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weight = Number(form.get("initial_weight_g"));
    const invoiceAmount = Number(form.get("purchase_total") || form.get("cost"));
    const purchaseVatAmount = Number(form.get("purchase_vat_amount") || 0);
    const purchaseVatTreatment = String(
      form.get("purchase_vat_treatment") || "included_in_cost",
    );
    const enteredCost = Number(form.get("cost"));
    if (
      !roll &&
      (purchaseVatAmount < 0 ||
        purchaseVatAmount > invoiceAmount ||
        (purchaseVatTreatment === "deductible" &&
          purchaseVatAmount > enteredCost))
    ) {
      setErrorMessage(
        "El IVA debe estar entre cero y el valor de compra; el costo neto no puede ser negativo.",
      );
      return;
    }
    const input = {
      brand: String(form.get("brand")).trim(),
      material: String(form.get("material")),
      color: String(form.get("color")).trim(),
      initial_weight_g: weight,
      remaining_weight_g: roll?.remaining_weight_g ?? weight,
      cost:
        !roll && purchaseVatTreatment === "deductible"
          ? enteredCost - purchaseVatAmount
          : enteredCost,
      supplier_id: String(form.get("supplier_id")) || null,
      purchase_total: roll ? 0 : invoiceAmount,
      purchase_vat_amount: roll ? 0 : purchaseVatAmount,
      purchase_vat_treatment: roll
        ? "included_in_cost"
        : purchaseVatTreatment,
    };
    setBusy(true);
    setErrorMessage("");
    try {
      if (roll) await updateFilamentRoll(roll.id, input);
      else await createFilamentRoll(input);
      await onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="form-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">INVENTARIO</p>
            <h2 id="form-title">{roll ? "Editar bobina" : "Agregar bobina"}</h2>
          </div>
          <button
            aria-label="Cerrar"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label>
              Marca
              <input
                autoFocus
                defaultValue={roll?.brand ?? ""}
                maxLength={100}
                name="brand"
                placeholder="Ej. Polymaker"
                required
              />
            </label>
            <label>
              Material
              <select defaultValue={roll?.material ?? "PLA"} name="material">
                {materials.map((material) => (
                  <option value={material}>
                    {material === "OTHER" ? "Otro" : material}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input
                defaultValue={roll?.color ?? ""}
                maxLength={80}
                name="color"
                placeholder="Ej. Negro mate"
                required
              />
            </label>
            {!roll && (
              <label>
                Peso inicial (g)
                <input
                  min="1"
                  name="initial_weight_g"
                  required
                  step="1"
                  type="number"
                />
              </label>
            )}
            <label>
              {roll ? "Costo registrado del rollo" : "Valor facturado del rollo"}
              <input
                defaultValue={roll?.cost ?? ""}
                min="0"
                name="cost"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="span-two">
              Proveedor
              <select defaultValue={roll?.supplier_id ?? ""} name="supplier_id">
                <option value="">Sin proveedor</option>
                {suppliers.map((supplier) => (
                  <option value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
          </div>
          {!roll && (
            <>
              <label>
                Tratamiento del IVA de compra
                <select
                  defaultValue={
                    fiscalSettings?.is_vat_responsible
                      ? "deductible"
                      : "included_in_cost"
                  }
                  name="purchase_vat_treatment"
                >
                  <option value="included_in_cost">Mayor valor del costo</option>
                  <option
                    disabled={!fiscalSettings?.is_vat_responsible}
                    value="deductible"
                  >
                    IVA descontable (perfil responsable de IVA)
                  </option>
                </select>
              </label>
              <label>
                IVA de la factura ({fiscalSettings?.currency_code ?? "COP"})
                <input
                  defaultValue="0"
                  min="0"
                  name="purchase_vat_amount"
                  step="0.01"
                  type="number"
                />
              </label>
              <p className="message info">
                El valor facturado se guarda como soporte de compra. Si marcas
                IVA descontable, se resta del costo usado para calcular el
                material; confirma que puedes descontarlo con tu contador.
              </p>
            </>
          )}
          {roll && (
            <p className="message info">
              La edición conserva el peso disponible y los movimientos
              existentes.
            </p>
          )}
          {errorMessage && (
            <p className="message error" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy} type="submit">
              {busy
                ? "Guardando…"
                : roll
                  ? "Guardar cambios"
                  : "Guardar bobina"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

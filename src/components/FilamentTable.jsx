import { Box, PackageOpen, Pencil } from "lucide-react";
import { formatCurrency } from "../utils/business";
const number = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});
export default function FilamentTable({
  rolls,
  loading,
  currencyCode = "COP",
  onEdit,
  supplierNames,
}) {
  if (loading)
    return (
      <div className="empty-state">
        <span className="spinner" />
        Cargando inventario…
      </div>
    );
  if (rolls.length === 0) {
    return (
      <div className="empty-state">
        <PackageOpen size={30} />
        <strong>Aún no hay bobinas</strong>
        <span>
          Agrega tu primera bobina para empezar a controlar el material.
        </span>
      </div>
    );
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Filamento</th>
            <th>Material</th>
            <th>Color</th>
            <th>Proveedor</th>
            <th>Disponible</th>
            <th>Costo / rollo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rolls.map((roll) => {
            const percent =
              roll.initial_weight_g > 0
                ? (roll.remaining_weight_g / roll.initial_weight_g) * 100
                : 0;
            return (
              <tr>
                <td>
                  <div className="product-cell">
                    <span className="product-icon">
                      <Box size={17} />
                    </span>
                    <span>
                      <strong>{roll.brand}</strong>
                      <small>
                        Bobina · {number.format(roll.initial_weight_g)} g
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="badge">{roll.material}</span>
                </td>
                <td>{roll.color}</td>
                <td>
                  {roll.supplier_id
                    ? (supplierNames[roll.supplier_id] ??
                      "Proveedor no disponible")
                    : "—"}
                </td>
                <td>
                  <div className="stock-cell">
                    <span>{number.format(roll.remaining_weight_g)} g</span>
                    <span className="progress-track">
                      <span
                        className="progress-bar"
                        style={{
                          width: `${Math.min(100, Math.max(0, percent))}%`,
                        }}
                      />
                    </span>
                  </div>
                </td>
                <td>{formatCurrency(roll.cost, currencyCode)}</td>
                <td>
                  <button
                    aria-label={`Editar bobina ${roll.brand} ${roll.color}`}
                    className="icon-button"
                    onClick={() => onEdit(roll)}
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
  );
}

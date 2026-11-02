# Esquema de Supabase

El esquema se aplica en orden: [`20261019000000_create_inventory.sql`](../supabase/migrations/20261019000000_create_inventory.sql), [`20261019000001_multi_tenant_access.sql`](../supabase/migrations/20261019000001_multi_tenant_access.sql) y [`20261019000002_customer_privacy_consent.sql`](../supabase/migrations/20261019000002_customer_privacy_consent.sql). No copies claves privadas al repositorio.

## Tablas

| Tabla | Propósito | Campos principales |
| --- | --- | --- |
| `companies` | Empresas/talleres aislados entre sí | `name`, `created_by`, `created_at` |
| `company_memberships` | Vincula cada usuario a sus empresas y rol | `company_id`, `user_id`, `role` |
| `platform_admins` | Administradores globales autorizados | `user_id` |
| `user_profiles` | Empresa activa de la sesión | `user_id`, `active_company_id` |
| `suppliers` | Proveedores de una empresa | `company_id`, `name`, `email`, `phone`, `notes` |
| `filament_rolls` | Bobinas y cantidad de filamento disponible | `brand`, `material`, `color`, `initial_weight_g`, `remaining_weight_g`, `cost`, `status`, `supplier_id` |
| `hardware_items` | Impresoras, accesorios, repuestos y herramientas | `name`, `category`, `quantity`, `unit`, `minimum_quantity`, `cost`, `supplier_id` |
| `printers` | Equipos de impresión y costos específicos | `name`, `model`, `power_w`, `wear_per_hour`, `status` |
| `products` | Catálogo, producción y tarifa IVA opcional por producto | `name`, `material`, `grams_per_unit`, `hours_per_unit`, `post_processing_hours_per_unit`, `default_price`, `vat_rate` |
| `inventory_movements` | Historial de compras, consumo y ajustes de stock | `filament_roll_id` o `hardware_item_id`, `movement_type`, `quantity`, `purchase_total`, `purchase_vat_amount`, `purchase_vat_treatment` |
| `workshop_settings` | Costos, moneda y perfil fiscal configurable por usuario | `labor_rate_per_hour`, `entity_type`, `is_vat_responsible`, `default_vat_rate`, `tax_regime`, `invoice_prefix`, `business_name`, `tax_id`, `currency_code` |
| `customers` | Directorio de contactos autorizados por cliente | `name`, `email`, `phone`, `privacy_consent_status`, `privacy_consent_at`, `privacy_consent_method`, `privacy_notice_version` |
| `orders` | Pedidos, costos y fotografía del perfil fiscal usado al cotizar | `customer_id`, `product_id`, `quantity`, costos de producción, `sale_subtotal`, `vat_rate`, `vat_amount`, `sale_price`, datos fiscales históricos |
| `order_payments` | Abonos asociados a pedidos | `order_id`, `amount`, `payment_method`, `notes`, `created_at` |
| `order_refunds` | Reembolsos manuales asociados a un abono | `order_id`, `payment_id`, `product_return_id` (opcional), `amount`, `refund_method`, `notes`, `created_at` |
| `order_product_returns` | Unidades devueltas de pedidos entregados | `order_id`, `quantity`, `item_condition`, `notes`, `created_at` |

Cada tabla de negocio tiene `company_id`; las políticas RLS limitan cada solicitud a la empresa activa del usuario. La base de datos valida además las relaciones entre registros de la misma empresa. Los administradores globales solo consultan o modifican una empresa a la vez y deben cambiar explícitamente la empresa activa. Los pagos y devoluciones conservan sus restricciones de escritura por RPC. `user_id` se conserva como autoría, no como límite de aislamiento. Los importes se guardan como valores numéricos sin conversión. La moneda predeterminada es COP.

## Datos personales de clientes

- El directorio guarda únicamente nombre, correo y teléfono; no se agregaron números de documento, direcciones ni otros datos sensibles.
- Para crear o editar un registro, el operador debe confirmar que el cliente autorizó el tratamiento, indicar el medio de autorización y haberle informado los fines: gestión de cotizaciones, pedidos y comunicaciones relacionadas. Se guarda fecha/hora y versión del aviso (`1.0`). La política RLS de la base de datos también impide insertar o actualizar registros del directorio sin esos campos.
- Los clientes antiguos de la migración reciben `privacy_consent_status = not_recorded`; no se presume que hayan autorizado el uso. No aparecerán como cliente seleccionable para nuevos pedidos hasta regularizar su autorización. Revisa esos registros y elimina los que no deban conservarse.
- En un pedido, seleccionar un cliente autorizado usa su registro. Si no se autoriza guardar el nombre, deja el campo de nombre vacío: se guardará como “Cliente ocasional”. Si se escribe un nombre directamente en el pedido, el operador debe confirmar que el cliente autorizó incluirlo. El consentimiento del directorio y el tratamiento necesario para un pedido deben explicarse al cliente con un aviso claro.
- Los informes Excel incluyen datos de contacto y el estado de autorización. Descárgalos solo para fines de administración autorizados y guárdalos de forma segura.
- Esta funcionalidad registra la confirmación del operador; no verifica por sí sola la identidad del titular ni constituye una política de tratamiento completa. Prepara y publica el aviso/política aplicable, define el canal para consultas, actualización, supresión y revocatoria, y valida el flujo con asesoría legal para Colombia antes de producción. La app no reemplaza esas obligaciones.

## Perfil fiscal y costos

- Los valores iniciales son `entity_type = NATURAL_PERSON`, `is_vat_responsible = false`, `default_vat_rate = 0.19`, `tax_regime = NOT_APPLICABLE`, `currency_code = COP` y prefijo interno `COT`. El 19% queda configurado como tarifa predeterminada, pero no se suma mientras no se marque que la cuenta es responsable de IVA.
- La activación del IVA, el tipo de entidad y el régimen se cambian manualmente en Configuración. La transición planeada para 2027 no activa impuestos automáticamente; confirma las fechas, responsabilidades y tratamiento aplicable con tu contador.
- En Catálogo, una tarifa IVA opcional por producto sustituye la predeterminada; si queda vacía, hereda la tasa global. Cada pedido conserva subtotal, tasa, IVA, total, perfil, prefijo, razón social, NIT y moneda como fotografía histórica. Los cambios posteriores no modifican pedidos ya creados.
- La calculadora incluye material, energía, desgaste de máquina y mano de obra/postprocesamiento. El costo de una compra almacena IVA como mayor valor cuando se configura `included_in_cost`; con perfil responsable, se puede registrar `deductible` y descontar el IVA informado del costo unitario al crear una bobina o accesorio. Los movimientos de reposición conservan total e IVA como referencia, pero no recalculan automáticamente el costo promedio del artículo.
- El módulo Cotizaciones permite imprimir o guardar en PDF una cotización/cuenta de cobro interna usando los datos fiscales del pedido. **No genera una factura electrónica DIAN ni un documento equivalente validado**; el prefijo mostrado es una referencia interna, no una resolución ni numeración autorizada. La integración fiscal real queda pendiente de los requisitos del negocio y de un proveedor/flujo DIAN apropiado.
- En Pagos, el botón **Registrar pago** permite escoger cualquier pedido pendiente y registrar abonos parciales. La cuenta de cobro imprimible de cada pedido refleja total, abonos netos y saldo pendiente según los movimientos vigentes. Se imprime o guarda como PDF desde el navegador; no se archiva como documento en Supabase y no reemplaza una factura electrónica.

Las claves foráneas compuestas también exigen que proveedores y artículos asociados pertenezcan a la misma empresa. Por eso, no se puede eliminar un proveedor mientras una bobina o artículo aún lo referencia; primero borra esa asociación.

El stock se modifica mediante funciones RPC transaccionales: al crear una bobina o accesorio se registra su entrada inicial; compras, consumos y ajustes actualizan el saldo y registran el movimiento de forma atómica. Las cantidades se guardan con signo (entradas positivas, salidas negativas). Si ya existían bobinas o accesorios antes de esta versión y aún no tienen movimientos, la migración registra su saldo actual como movimiento de apertura. Las políticas y permisos impiden modificar directamente existencias o el historial desde el cliente.

## Crear el esquema y habilitar el acceso

1. Abre el proyecto en Supabase y entra en **SQL Editor**.
2. Ejecuta las tres migraciones (`20261019000000`, `20261019000001`, `20261019000002`) en ese orden y una sola vez por migración. No ejecutes solo la primera migración en una instalación nueva.
3. En **Authentication → Providers → Email**, desactiva **Allow new users to sign up**. El inicio de sesión sigue disponible; las cuentas nuevas se crean mediante invitación del administrador. Mantén la confirmación de correo habilitada y configura el servicio de correo para producción.
4. En **Authentication → Users**, crea la cuenta que será el administrador global inicial.
5. Copia el UUID de esa cuenta y, desde SQL Editor, autorízala explícitamente:

   ```sql
   insert into public.platform_admins (user_id)
   values ('UUID-DE-LA-CUENTA-ADMIN');
   ```

   No agregues cuentas normales a `platform_admins`. Esta tabla no permite asignar el rol desde la aplicación.
6. Comprueba que las 16 tablas estén creadas y que RLS esté habilitado. Las tablas de negocio deben incluir `company_id`.

## Conectar la aplicación

1. Copia `.env.example` a `.env` en la raíz del proyecto.
2. En Supabase → **Project Settings → API**, configura:

   ```env
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANON_O_PUBLISHABLE
   ```

   Copia **Project URL**, no la URL REST terminada en `/rest/v1/`. La aplicación elimina ese sufijo si se pega por error, pero la configuración recomendada es solo la URL base del proyecto.
3. No configures nunca `service_role` o una clave secreta con prefijo `sb_secret_` en variables `VITE_*`: Vite las publica en el navegador. La seguridad de la clave pública depende de las políticas RLS.
4. Configura y despliega la función Edge `admin-provision-user` desde la raíz del proyecto con Supabase CLI. La clave de servicio solo se guarda como secreto del servidor/Edge Function; nunca en `.env` del frontend:

   ```powershell
   supabase functions deploy admin-provision-user
   supabase secrets set APP_ORIGIN=http://127.0.0.1:5173 AUTH_REDIRECT_URL=http://127.0.0.1:5173/
   ```

   La función permite `localhost:5173` y `127.0.0.1:5173` para desarrollo local, aunque `APP_ORIGIN` tenga configurado uno de los dos. En producción, `APP_ORIGIN` debe ser el origen HTTPS exacto desde el que se abre la aplicación (por ejemplo, `https://admin.ejemplo.com`, sin ruta); los dominios personalizados, el dominio `*.vercel.app` y los despliegues de vista previa son orígenes diferentes. La función compara el origen sin ruta ni barra final. Después de cambiar el secreto, despliega de nuevo la función. Agrega también el redirect URL configurado en `AUTH_REDIRECT_URL` a la lista permitida de **Authentication → URL Configuration**. La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` desde el entorno seguro de Edge Functions; no los dupliques en variables `VITE_*`.
5. Ejecuta `npm run dev` e inicia sesión con la cuenta global. En **Administración global**, invita un usuario a una empresa existente o crea una empresa nueva y envía la invitación. El usuario abre el enlace, establece su contraseña en la aplicación y queda asociado únicamente a esa empresa.

El SQL inicial es una tarea de bootstrap que solo se realiza para el administrador global. No hay autorregistro en la pantalla de acceso. La segunda migración asigna por separado los datos existentes de cada usuario a una nueva empresa; no mezcla ni combina automáticamente datos de usuarios previos.

## Controles de aislamiento

- RLS usa el identificador de empresa activo obtenido desde la sesión; no confía en un `company_id` enviado libremente por el navegador.
- La función Edge valida el token del usuario y su existencia en `platform_admins` antes de crear una empresa, invitar una cuenta o insertar la membresía.
- No despliegues la función con una clave administrativa en el bundle web, ni actives el registro público. Mantén MFA en la cuenta global y limita el acceso al panel de Supabase.
- Antes de producción, valida con dos usuarios de empresas diferentes que ambos no puedan leer, modificar, asociar ni exportar información ajena. También comprueba el cambio de empresa del administrador global. La migración no se ha ejecutado contra un proyecto Supabase desde este entorno.

## Módulos incluidos

- **Panel general:** resumen del inventario, pedidos activos, ventas entregadas y actividad reciente.
- **Inventario:** filamentos, hardware y accesorios, alertas de stock mínimo e historial de movimientos. Se pueden editar los datos de una bobina sin alterar su saldo ni sus movimientos; ambos tipos de artículos pueden asociarse a proveedores.
- **Impresoras:** potencia, desgaste por hora y estado de cada equipo.
- **Catálogo:** productos y colecciones con consumo, duración y precio base para reutilizarlos en pedidos.
- **Clientes y proveedores:** altas, consultas, ediciones y eliminación con protección de referencias existentes.
- **Costos:** costo de material por gramo del rollo, energía según potencia y tarifa, desgaste de máquina, mano de obra/postprocesamiento y margen. Presenta subtotal, IVA y total cuando el perfil indica responsabilidad de IVA.
- **Pedidos y producción:** búsqueda, filtro por estado, detalle y cancelación de pedidos pendientes o en producción. Los costos y la fotografía fiscal (subtotal, IVA, total, perfil y moneda) quedan guardados con el pedido. Al avanzar de `pending` a `printing`, Supabase descuenta los gramos por unidad multiplicados por la cantidad y registra el movimiento dentro de la misma transacción. La secuencia permitida es `pending` → `printing` → `post_processing` → `delivered`; al cancelar antes de la entrega, la RPC bloquea el pedido y registra atómicamente solo los gramos de filamento que el usuario confirma haber recuperado. El resto queda como consumo. Los pedidos entregados no se cancelan por este flujo.
- **Pagos:** registra abonos en efectivo, transferencia, tarjeta u otros métodos; muestra recaudado y saldo pendiente por pedido, conserva el historial y bloquea pagos superiores al saldo mediante una función RPC transaccional. Los pagos son registros manuales: no procesa tarjetas, no conecta pasarelas y no genera facturas fiscales.
- **Devoluciones de pagos:** registra reembolsos manuales hasta el saldo de cada abono para pedidos no entregados. Antes de cancelar un pedido, registra el reembolso de todos sus abonos. Al cancelar un pedido en producción, la cantidad de filamento que confirmes haber recuperado vuelve al stock y queda registrada en la misma transacción.
- **Devoluciones de productos:** registra devoluciones parciales de pedidos entregados, el estado del artículo (revendible, requiere reparación o no aprovechable) y, opcionalmente, el reembolso. El reembolso debe asociarse a un abono, no puede superar su saldo disponible ni el valor proporcional de las unidades devueltas. La operación es atómica; no devuelve dinero automáticamente ni repone filamento o inventario de productos.
- **Fiscal y cotizaciones:** configura perfil de persona natural/SAS, responsabilidad IVA, tarifa predeterminada, régimen y prefijo de documento; imprime cotizaciones internas en PDF. No sustituye el servicio de facturación electrónica DIAN.
- **Informes administrativos:** revisión por rango de fechas y descarga de libros Excel `.xlsx` completos, contables, de compras/inventario o administrativos. El libro completo contiene resumen, pedidos con fotografía de IVA, abonos, reembolsos, productos devueltos, compras e IVA soportado, movimientos, inventario actual, clientes, proveedores, catálogo, impresoras y configuración fiscal. Las transacciones se filtran por su fecha de creación; saldos reflejan acumulados actuales y las tablas maestras/inventario muestran el estado actual. Los importes de compras históricos no capturados se identifican como no registrados, no como cero.
- **Configuración:** moneda COP, tarifas de costos y parámetros fiscales editables. Los cambios no convierten saldos ni reescriben pedidos; confirma la configuración tributaria con un contador antes de emitir documentos tributarios.

El costo y precio calculado al crear un pedido no se recalculan automáticamente cuando cambian las tarifas o el inventario; así se conserva la estimación cotizada originalmente. Si un pedido consume filamento, selecciona una bobina y define gramos por unidad para que el inicio de impresión pueda descontar stock. Las devoluciones son registros contables manuales: no realizan transferencias ni reversan cargos en pasarelas externas. No ejecutes todavía la migración si los módulos siguen en desarrollo; aplícala completa una vez que terminemos y antes de comenzar las pruebas con Supabase.

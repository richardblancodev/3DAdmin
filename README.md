# TallerAdmin 3D

Aplicación web para administrar un taller de impresión 3D: inventario, producción, clientes, costos, pagos y reportes. Está pensada para operación en Colombia, usa COP por defecto y permite configurar el perfil fiscal del negocio.

> Las cotizaciones y cuentas de cobro son documentos informativos generados por la aplicación. No son facturas electrónicas ni documentos equivalentes validados por la DIAN.

## Funcionalidades

- **Panel general:** indicadores de inventario, pedidos y actividad.
- **Inventario:** bobinas de filamento, hardware y accesorios, movimientos, stock mínimo y proveedores.
- **Impresoras:** registro de equipos, consumo eléctrico, desgaste y estado.
- **Catálogo y pedidos:** productos, clientes, estados de producción, costos y fotografía de precios e impuestos del pedido.
- **Calculadora de costos:** material, energía, desgaste, mano de obra, margen e IVA según el perfil fiscal activo.
- **Pagos y devoluciones:** registro manual de abonos, saldos por pedido, historial y devoluciones de pagos o productos.
- **Documentos comerciales:** impresión o guardado como PDF de cotizaciones y cuentas de cobro informativas. Las cuentas de cobro generadas desde Pagos muestran el total, abonos netos y saldo pendiente; no se almacenan en Supabase.
- **Reportes:** descarga de archivos Excel `.xlsx` con filtros de fecha.
- **Administración multiempresa:** el administrador global crea empresas e invita usuarios. El acceso a los datos se limita a la empresa activa.
- **Privacidad de clientes:** el directorio requiere registrar la autorización de tratamiento antes de guardar datos personales.

## Stack

- React 19 y JavaScript/JSX.
- Vite 6 para desarrollo y compilación estática.
- Tailwind CSS 4 como integración de estilos, más estilos propios en `src/styles.css`.
- Supabase: PostgreSQL, Auth, Row Level Security (RLS) y funciones RPC.
- Supabase Edge Function `admin-provision-user` para crear empresas e invitar usuarios.
- `xlsx` para generar reportes de Excel y `lucide-react` para iconografía.

La interfaz no tiene un servidor de aplicación propio. Vercel sirve el frontend estático; la autenticación y persistencia se gestionan en Supabase.

## Requisitos

- Node.js 20 LTS recomendado (Node.js 18 o superior).
- npm.
- Un proyecto Supabase para usar autenticación y guardar información.
- Supabase CLI solo para vincular el proyecto y desplegar la función Edge.

## Desarrollo local

Desde la raíz del proyecto:

```powershell
npm ci
Copy-Item .env.example .env
```

Edita `.env` y configura la URL del proyecto y la clave pública de Supabase:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANON_O_PUBLISHABLE
```

Inicia el servidor:

```powershell
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173/`. Las variables `VITE_*` se incorporan al código del navegador durante la compilación. **Nunca coloques `service_role`, `sb_secret_*` u otras claves secretas en `.env` del frontend.**

Si las variables públicas no están configuradas, la aplicación muestra la pantalla de configuración inicial en lugar de conectarse a Supabase.

## Configuración de Supabase

1. Crea el proyecto y configura Authentication siguiendo [`docs/SUPABASE.md`](docs/SUPABASE.md).
2. Ejecuta en Supabase SQL Editor las migraciones de `supabase/migrations/` en orden:
   - `20261019000000_create_inventory.sql`
   - `20261019000001_multi_tenant_access.sql`
   - `20261019000002_customer_privacy_consent.sql`
3. Crea la primera cuenta administradora y autorízala en `public.platform_admins` según la guía.
4. Desactiva el registro público de usuarios. Las cuentas nuevas se crean por invitación.
5. Instala y autentica Supabase CLI, vincula el proyecto y despliega la función:

   ```powershell
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase functions deploy admin-provision-user
   ```

6. Configura en Supabase los secretos `APP_ORIGIN` y `AUTH_REDIRECT_URL` para el origen de desarrollo o producción correspondiente:

   ```powershell
   supabase secrets set APP_ORIGIN=https://TU-DOMINIO AUTH_REDIRECT_URL=https://TU-DOMINIO/
   ```

   El dominio y URL de redirección también deben estar permitidos en **Authentication → URL Configuration**. La función Edge usa la clave administrativa únicamente del lado servidor; no copies esa clave en Vercel como variable `VITE_*`.

La guía [`docs/SUPABASE.md`](docs/SUPABASE.md) contiene el esquema, los pasos detallados de configuración, el flujo de administración y las consideraciones de aislamiento y privacidad. Las migraciones deben probarse en un proyecto Supabase antes de usar la aplicación con datos reales.

## Compilación y validación

```powershell
npm run build
npm run preview
```

La salida de producción se genera en `dist/`. El proyecto actualmente no define scripts de pruebas automatizadas ni de lint; la compilación es la validación disponible en el package actual.

## Despliegue en Vercel

1. Sube el código fuente a un repositorio GitHub y selecciónalo en Vercel.
2. Vercel detecta Vite. Usa `npm run build` como comando de compilación y `dist` como directorio de salida.
3. En la configuración del proyecto de Vercel, agrega estas variables tanto para Production como para los entornos que vayas a probar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Despliega la función Edge de Supabase por separado y ajusta `APP_ORIGIN`, `AUTH_REDIRECT_URL` y la lista de URL permitidas para el dominio HTTPS de Vercel.
5. Ejecuta un despliegue y prueba inicio de sesión, invitaciones, aislamiento entre empresas y lecturas/escrituras con RLS antes de cargar información real.

El frontend es una SPA sencilla sin rutas de servidor; la navegación entre módulos se realiza dentro de React. No se necesita desplegar una API Node.js en Vercel.

## Estructura del proyecto

```text
src/
  components/    Módulos y componentes de interfaz
  image/         Logo y favicon oficiales
  lib/           Cliente de Supabase
  services/      Consultas y operaciones Supabase
  utils/         Cálculos y funciones compartidas
  App.jsx        Sesión, contexto de empresa y navegación
  main.jsx       Entrada de React
  styles.css     Estilos globales
supabase/
  functions/     Funciones Edge
  migrations/    Esquema, RLS, RPC y evolución de la base
docs/
  SUPABASE.md    Guía técnica y de configuración de Supabase
```

## Seguridad y alcance

- La clave pública de Supabase no sustituye las políticas RLS. Las tablas de negocio se aíslan por `company_id`; el cambio de empresa del administrador global es explícito.
- Las operaciones de pagos, devoluciones, inventario y transiciones de pedidos usan RPC con validaciones en la base de datos.
- Los informes Excel pueden incluir información financiera y datos personales: descárgalos y compártelos solo con personas autorizadas.
- No guardes `.env`, credenciales, exportaciones con datos reales ni secretos de Supabase en GitHub. `.gitignore` excluye `.env`, `node_modules`, `dist`, metadatos locales de Supabase y archivos locales de Vercel.
- El perfil fiscal inicial es configurable y no activa automáticamente cambios por fecha. Confirma las obligaciones tributarias y los documentos requeridos con un contador en Colombia.
- La aplicación no procesa pagos con tarjeta ni integra una pasarela de pagos o facturación electrónica DIAN.

## Publicar el repositorio en GitHub

Antes de publicar, revisa que el repositorio no contenga archivos `.env`, claves, datos reales de clientes ni archivos de Excel exportados. Después de crear un repositorio vacío en GitHub, desde la carpeta del proyecto puedes usar:

```powershell
git init
git add .
git status
git commit -m "Preparar TallerAdmin 3D para portafolio"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

Comprueba la salida de `git status` antes de confirmar el commit y no agregues archivos ignorados mediante `git add -f`.

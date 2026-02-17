
# Sotracor App - Versión Final

Esta aplicación permite consultar los reportes de vehículos de la empresa **Sotracor** filtrando por número de placa.
La aplicación ha sido migrada desde Google Sheets a **Supabase** para mejorar el rendimiento y la escalabilidad.

## Características

-   **Consulta en tiempo real**: Conexión directa a Supabase.
-   **PWA**: Instalable en dispositivos móviles (Android/iOS).
-   **Diseño Premium**: Interfaz moderna con modo oscuro y efectos visuales.

## Configuración y Despliegue

### Variables de Entorno

Para que el ERP o cualquier integración externa se conecte a la API de Supabase, asegúrese de configurar las siguientes variables en su entorno de despliegue (Netlify, Vercel, VPS, etc.) o en su archivo `.env` local:

```env
VITE_SUPABASE_URL=https://ewpmmjgizixhrjfrjede.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_NIGr1btBcpVAfyFNWmP8eQ_2c_IxgVP
```

**Nota:** La `ANON_KEY` es pública y segura para usar en el cliente. Para operaciones administrativas desde el servidor, utilice la `SERVICE_ROLE_KEY` (no incluida aquí por seguridad).

### Instalación Local

1.  Clonar el repositorio:
    ```bash
    git clone https://github.com/abcprogramado1/ANTIGRAVITY.git
    cd ANTIGRAVITY
    ```

2.  Instalar dependencias:
    ```bash
    npm install
    ```

3.  Ejecutar en desarrollo:
    ```bash
    npm run dev
    ```

4.  Construir para producción:
    ```bash
    npm run build
    ```

### Estructura de Base de Datos

La aplicación consulta la tabla `reportes` (opcionalmente `Despachos` si no existe la primera) en Supabase.
Asegúrese de que el esquema de la tabla coincida con los campos esperados (Placa, Fecha, Descripción, etc.).

## Tecnologías

-   **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+).
-   **Backend**: Supabase (PostgreSQL).
-   **Build Tool**: Vite.

---
© 2026 Sotracor S.A.

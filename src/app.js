import { supabase } from './supabaseClient.js'

// --- State Management ---
let session = JSON.parse(localStorage.getItem('sotracor_session')) || null;
let isAdmin = session ? session.role === 'admin' : false;
let currentTab = 'Despachos';
let realtimeChannel = null;

// --- DOM Elements ---
const loginOverlay = document.getElementById('login-overlay');
const dashboardLayout = document.getElementById('layout');
const loginEmailInput = document.getElementById('login-email');
const loginPassInput = document.getElementById('login-password');
const btnDoLogin = document.getElementById('btn-do-login');
const btnLogout = document.getElementById('btn-logout');

const userDisplayName = document.getElementById('user-display-name');
const userDisplayRole = document.getElementById('user-display-role');

const dateStartInput = document.getElementById('date-start');
const dateEndInput = document.getElementById('date-end');
const placaInput = document.getElementById('placa-input');
const resultsContainer = document.getElementById('results-container');
const tabButtons = document.querySelectorAll('.tab-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (session) {
        showDashboard();
    } else {
        showLogin();
    }

    // Set default dates (Last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    dateStartInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    dateEndInput.value = today.toISOString().split('T')[0];
});

// --- Authentication Logic ---

async function login() {
    const input = loginEmailInput.value.trim().toLowerCase();
    const password = loginPassInput.value.trim();

    if (!input || !password) {
        alert('Por favor ingrese su identificación/correo y contraseña.');
        return;
    }

    // Special Case: Superusuario (Acceso Total)
    if (input === '2@sotracor.com' && password === '123') {
        session = { email: input, role: 'ADMIN_TOTAL', name: 'Superusuario Administración' };
        saveSession();
        currentTab = 'Aportes';
        showDashboard();
        return;
    }

    try {
        // 1. Check Admin Profile
        const { data: admin } = await supabase
            .from('perfiles_admin')
            .select('*')
            .eq('email', input)
            .single();

        if (admin) {
            if (admin.password === password) {
                isAdmin = true;
                session = { email: input, role: 'admin', name: 'Administrador' };
                saveSession();
                showDashboard();
                return;
            } else {
                alert('Contraseña de administrador incorrecta.');
                return;
            }
        }

        // 2. Check Propietario Profile (Search by Email or Cedula)
        let propQuery = supabase.from('perfiles_propietarios').select('*');

        if (input.includes('@')) {
            propQuery = propQuery.eq('email', input);
        } else {
            const numCedula = parseInt(input.replace(/[^0-9]+/g, ""));
            if (isNaN(numCedula)) {
                alert('La identificación debe ser un número o un correo válido.');
                return;
            }
            propQuery = propQuery.eq('cedula', numCedula);
        }

        const { data: prop, error: propError } = await propQuery.single();

        if (prop) {
            // Already enrolled
            if (prop.password === password) {
                await startPropietarioSession(prop);
                return;
            } else {
                alert('Contraseña incorrecta.');
                return;
            }
        } else {
            // Not enrolled yet - Try to register if input is Cedula
            if (!input.includes('@')) {
                const numCedula = parseInt(input.replace(/[^0-9]+/g, ""));

                // Verify if owner exists in Aportes or Despachos
                const { data: exists } = await supabase
                    .from('Aportes')
                    .select('Placa, Propietario')
                    .eq('Cedula', numCedula)
                    .limit(1)
                    .single();

                if (exists) {
                    // Automate enrollment
                    const { error: insError } = await supabase
                        .from('perfiles_propietarios')
                        .insert([{
                            cedula: numCedula,
                            password: password,
                            email: null // Can be updated later
                        }]);

                    if (insError) throw insError;

                    alert('¡Registro exitoso! Su perfil ha sido creado automáticamente.');
                    await startPropietarioSession({ cedula: numCedula, email: null });
                    return;
                } else {
                    alert('No se encontró un propietario con esa cédula en los registros de Sotracor.');
                }
            } else {
                alert('Correo no registrado. Si es propietario, intente ingresar con su cédula para inscribirse.');
            }
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Error de conexión o validación.');
    }
}

async function startPropietarioSession(prop) {
    isAdmin = false;
    // Find linked Placa
    const { data: plateData } = await supabase
        .from('Aportes')
        .select('Placa')
        .eq('Cedula', prop.cedula)
        .limit(1)
        .single();

    session = {
        email: prop.email || `${prop.cedula}@propietario.sotracor`,
        role: 'propietario',
        name: 'Propietario',
        cedula: prop.cedula,
        placaLinked: plateData ? plateData.Placa : ''
    };
    saveSession();
    showDashboard();
}

function saveSession() {
    localStorage.setItem('sotracor_session', JSON.stringify(session));
}

function logout() {
    localStorage.removeItem('sotracor_session');
    location.reload();
}

function showLogin() {
    loginOverlay.style.display = 'flex';
    dashboardLayout.style.display = 'none';
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    dashboardLayout.style.display = 'flex';

    userDisplayName.textContent = session.name;

    isAdmin = session.role === 'admin' || session.role === 'ADMIN_TOTAL';
    const isTotalAdmin = session.role === 'ADMIN_TOTAL';

    // Role Indicator & Admin Interface
    if (isTotalAdmin) {
        userDisplayRole.innerHTML = '<span class="badge badge-admin" style="background: #e11d48; border-color: #be123c;">MODO: ADMINISTRACIÓN GLOBAL</span>';
        placaInput.readOnly = false;
        placaInput.placeholder = "Filtrar cualquier vehículo o ver flota completa...";
        loadPlacaSelector();
    } else if (isAdmin) {
        userDisplayRole.innerHTML = '<span class="badge badge-admin">Modo Administrador</span>';
        placaInput.readOnly = false;
        placaInput.placeholder = "Buscar cualquier placa...";
    } else {
        userDisplayRole.textContent = session.role;
        // Apply automatic Placa filter if available for Owner
        if (session.placaLinked) {
            placaInput.value = session.placaLinked;
            placaInput.readOnly = true;
            placaInput.style.background = '#f1f5f9';
        }
    }

    searchData();

    // Tab Event Listeners
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === currentTab);
        btn.onclick = () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            searchData();
        };
    });
}

// --- Data Logic ---

async function searchData() {
    const start = dateStartInput.value;
    const end = dateEndInput.value;
    const placa = placaInput.value.trim().toUpperCase();

    resultsContainer.innerHTML = '<div class="placeholder-view"><p class="placeholder-text">Cargando registros...</p></div>';

    try {
        let query = supabase.from(currentTab).select('*');

        // Role-Based Filtering Logic (Bypass para ADMIN_TOTAL)
        const isTotalAdmin = session.role === 'ADMIN_TOTAL';

        if (isTotalAdmin) {
            // Bypass de Filtros: Si hay input, filtra por placa. Si no, trae TODO (Consolidado).
            if (placa) {
                query = query.ilike('Placa', `%${placa}%`);
            }
        } else if (isAdmin) {
            // Administrador Estándar
            if (placa) {
                query = query.ilike('Placa', `%${placa}%`);
            }
        } else {
            // Propietario Normal: Ver solo sus registros asociados
            query = query.eq('Cedula', session.cedula);
        }

        // Date Range Filtering (Desactivado temporalmente por formatos de texto inconsistentes en BD)
        // const dateCol = 'Fecha';
        // if (start) query = query.gte(dateCol, start);
        // if (end) query = query.lte(dateCol, end);

        const { data, error } = await query.limit(100);

        console.log(`[DEBUG] Datos recibidos de ${currentTab}:`, data);
        if (error) {
            console.error(`[DEBUG] Error en ${currentTab}:`, error);
            throw error;
        }

        renderResults(data);
        setupRealtime();

    } catch (err) {
        console.error('Fetch error:', err);
        resultsContainer.innerHTML = `<div class="placeholder-view"><p class="placeholder-text" style="color: #ef4444;">Error de consulta: ${err.message}. Revisa la consola para más detalles.</p></div>`;
    }
}

function setupRealtime() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase.channel(`live:${currentTab}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: currentTab }, () => searchData())
        .subscribe();
}

function renderResults(data) {
    resultsContainer.innerHTML = '';
    if (!data || data.length === 0) {
        resultsContainer.innerHTML = '<div class="placeholder-view"><p class="placeholder-text">No se hallaron registros para el criterio seleccionado.</p></div>';
        return;
    }

    // Inicializar acumuladores
    let totalPlanilla = 0;
    let totalAportes = 0;
    let sumCumplimiento = 0;
    let countAportes = 0;

    let totalTarifaT = 0;
    let totalDescuentoT = 0;
    let totalRecaudadoT = 0;
    let totalProyectadoT = 0;

    data.forEach(item => {
        // Cálculo de totales si es la pestaña de Aportes
        if (currentTab === 'Aportes') {
            const vPlanilla = parseFloat(item["Vr. Planilla"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const vAportes = parseFloat(item["Vr. Aportes"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const vCump = parseFloat(item["% Cump"]?.toString().replace(',', '.')) || 0;

            totalPlanilla += vPlanilla;
            totalAportes += vAportes;
            sumCumplimiento += vCump;
            countAportes++;
        }

        // Cálculo de totales si es Tiqueteo
        if (currentTab === 'Tiquetes') {
            const tarifa = parseFloat(item["Tarifa"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const descuento = parseFloat(item["Vr. Descuento"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const recaudado = parseFloat(item["Vr. Recaudo"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const estadoEnvio = (item["Estado Envio"] || "").toUpperCase();

            if (estadoEnvio === "DOCUMENTO ENVIADO") {
                totalTarifaT += tarifa;
                totalDescuentoT += descuento;
                totalRecaudadoT += recaudado;
            }
            totalProyectadoT += recaudado;
        }

        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.innerHTML = currentTab === 'Aportes' ? renderAporte(item) :
            currentTab === 'Tiquetes' ? renderTiquete(item) : renderGeneric(item);
        resultsContainer.appendChild(card);
    });

    // Renderizado de Resumen Tiqueteo (Al principio)
    if (currentTab === 'Tiquetes' && data.length > 0) {
        const tiqueteoSummary = document.createElement('div');
        tiqueteoSummary.className = 'vehicle-card summary-card';
        tiqueteoSummary.style.gridColumn = '1 / -1';
        tiqueteoSummary.style.border = '2px solid #5b21b6';
        tiqueteoSummary.style.background = '#f5f3ff';
        tiqueteoSummary.innerHTML = `
            <div class="card-header" style="background: #5b21b6; color: white;">
                <span class="vehicle-number" style="background: white; color: #5b21b6;">RESUMEN TIQUETEO</span>
                <span class="report-date">FILTRADO POR: DOCUMENTO ENVIADO</span>
            </div>
            <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                <div class="card-section">
                    <span class="section-label">VALORES ENVIADOS</span>
                    <div class="detail-list">
                        <div class="detail-item"><span class="detail-label">Tarifa Total:</span><span class="detail-value">${fmtMoney(totalTarifaT)}</span></div>
                        <div class="detail-item"><span class="detail-label">Descuentos:</span><span class="detail-value" style="color: #ef4444;">-${fmtMoney(totalDescuentoT)}</span></div>
                        <div class="detail-item" style="border-top: 1px solid #ddd; padding-top: 8px;">
                            <span class="detail-label" style="font-weight: 800;">RECAUDADO:</span>
                            <span class="detail-value" style="color: #16a34a; font-size: 1.1rem;">${fmtMoney(totalRecaudadoT)}</span>
                        </div>
                    </div>
                </div>
                <div class="card-section" style="border-left: 1px dashed #ddd; padding-left: 1.5rem;">
                    <span class="section-label">PROYECCIÓN GLOBAL</span>
                    <div class="stat-row">
                        <span class="stat-value" style="color: #4338ca;">${fmtMoney(totalProyectadoT)}</span>
                    </div>
                    <span class="stat-info">TIQUETEO PROYECTADO (TOTAL RECAUDO)</span>
                </div>
            </div>`;
        resultsContainer.prepend(tiqueteoSummary);
    }

    // Añadir Tarjeta de Sumatorias si hay más de un registro y es modo admin
    if (isAdmin && data.length > 1 && currentTab === 'Aportes') {
        const avgCump = (sumCumplimiento / countAportes).toFixed(2);
        const summaryCard = document.createElement('div');
        summaryCard.className = 'vehicle-card summary-card';
        summaryCard.style.border = '2px solid var(--primary-blue)';
        summaryCard.style.background = '#f0f9ff';
        summaryCard.innerHTML = `
            <div class="card-header" style="background: var(--primary-blue); color: white;">
                <span class="vehicle-number" style="background: white; color: var(--primary-blue);">TOTALES</span>
                <span class="report-date">${data.length} VEHÍCULOS</span>
            </div>
            <div class="card-body">
                <div class="card-section">
                    <span class="section-label">TOTAL RECAUDADO FLOTA</span>
                    <div class="stat-row">
                        <span class="stat-value" style="color: var(--primary-blue);">${fmtMoney(totalAportes)}</span>
                        <span class="stat-info">Vr. Aportes</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                        <span style="font-size: 0.75rem; font-weight: 700;">PROMEDIO CUMP:</span>
                        <span class="badge ${avgCump >= 80 ? 'badge-green' : 'badge-yellow'}">${avgCump}%</span>
                    </div>
                </div>
                <div class="card-section" style="margin-top: 15px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                    <div class="detail-list">
                        <div class="detail-item">
                            <span class="detail-label">Total Planilla:</span>
                            <span class="detail-value">${fmtMoney(totalPlanilla)}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        resultsContainer.appendChild(summaryCard);
    }
}

// --- Utils ---
const fmtMoney = (v) => {
    let val = v;
    if (typeof v === 'string') {
        val = parseFloat(v.replace(/[^0-9.-]+/g, ""));
    }
    if (isNaN(val) || val === null) return '$0';

    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(val);
};

// --- Specialized Renderers ---

function renderTiquete(item) {
    const tarifa = parseFloat(item["Tarifa"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const descuento = parseFloat(item["Vr. Descuento"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const recaudado = parseFloat(item["Vr. Recaudo"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const estado = (item["Estado Envio"] || "SIN ESTADO").toUpperCase();

    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Placa || 'TKT'}</span>
            <span class="report-date">${item.Fecha || '-'}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">TIQUETE: ${item["No. Tiquete"] || '-'}</span>
                <div class="stat-row">
                    <span class="stat-value">${fmtMoney(recaudado)}</span>
                    <span class="stat-info">Recaudado</span>
                </div>
                <div class="badge ${estado === 'DOCUMENTO ENVIADO' ? 'badge-green' : 'badge-yellow'}" style="margin-top: 8px; font-size: 0.6rem;">
                    ${estado}
                </div>
            </div>
            <div class="card-section">
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Tarifa:</span><span class="detail-value">${fmtMoney(tarifa)}</span></div>
                    <div class="detail-item"><span class="detail-label">Descuento:</span><span class="detail-value" style="color: #ef4444;">${descuento > 0 ? '-' : ''}${fmtMoney(descuento)}</span></div>
                    <div class="detail-item"><span class="detail-label">Pasajero:</span><span class="detail-value" style="font-size: 0.7rem;">${item["Nombre del Pasajero"] || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderAporte(item) {
    // Tratamiento de Columnas con Caracteres Especiales (Mapeo CSV exacto)
    const vrAportesRaw = item["Vr. Aportes"] || '0';
    const vrPlanillaRaw = item["Vr. Planilla"] || '0';
    const pctRaw = item["% Cump"] || '0';

    // Conversión de texto a números para listado profesional
    const vrAportesNum = parseFloat(vrAportesRaw.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const vrPlanillaNum = parseFloat(vrPlanillaRaw.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const pctNum = parseFloat(pctRaw.toString().replace(',', '.')) || 0;

    const date = item["Fecha"] || item["Ult. Despacho"] || '-';

    let color = 'low';
    if (pctNum >= 80) color = 'high';
    else if (pctNum >= 50) color = 'mid';

    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Placa || 'FLOTA'}</span>
            <span class="report-date">${date}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">LIQUIDACIÓN DE FLOTA</span>
                <div class="stat-row">
                    <span class="stat-value">${fmtMoney(vrAportesNum)}</span>
                    <span class="stat-info">Vr. Aportes</span>
                </div>
                <div class="progress-bar" style="margin-top: 8px;">
                    <div class="progress-fill ${color}" style="width: ${Math.min(pctNum, 100)}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted);">% CUMPLIMIENTO:</span>
                    <span class="badge ${pctNum >= 80 ? 'badge-green' : 'badge-yellow'}">${pctNum}%</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">DATOS CONSOLIDADOS</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Vr. Planilla:</span><span class="detail-value">${fmtMoney(vrPlanillaNum)}</span></div>
                    <div class="detail-item"><span class="detail-label">Propietario:</span><span class="detail-value" style="font-size: 0.7rem;">${item.Propietario || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Estado:</span><span class="detail-value">${item.Estado || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderGeneric(item) {
    const val = item['Valor Total'] || item['Total Deuda'] || item['Vr. Aporte'] || '0';
    const date = item['Fecha'] || '-';
    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Placa || 'V-00'}</span>
            <span class="report-date">${date}</span>
        </div>
        <div class="card-body">
            <div class="stat-row">
                <span class="stat-value">${fmtMoney(val)}</span>
                <span class="stat-info">Importe</span>
            </div>
            <div class="detail-list" style="margin-top: 1rem;">
                <div class="detail-item"><span class="detail-label">Referencia:</span><span class="detail-value">${item.Ruta || item.Concepto || item.Agencia || '-'}</span></div>
                <div class="detail-item"><span class="detail-label">Responsable:</span><span class="detail-value" style="font-size: 0.75rem;">${item.Conductor || item.Propietario || '-'}</span></div>
            </div>
        </div>`;
}

// --- Global Placa Selector for Super Admin ---
async function loadPlacaSelector() {
    try {
        const { data } = await supabase.from('Aportes').select('Placa');
        if (!data) return;

        const uniquePlacas = [...new Set(data.map(i => i.Placa))].filter(Boolean).sort();

        let datalist = document.getElementById('placa-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'placa-list';
            document.body.appendChild(datalist);
            placaInput.setAttribute('list', 'placa-list');
        }

        datalist.innerHTML = uniquePlacas.map(p => `<option value="${p}">`).join('');
    } catch (e) {
        console.error("Error loading placa selector:", e);
    }
}

// --- Event Handlers ---
btnDoLogin.onclick = login;
btnLogout.onclick = logout;
placaInput.onkeypress = (e) => { if (e.key === 'Enter') searchData(); };
placaInput.oninput = () => { if (placaInput.value === '') searchData(); }; // Auto-search if cleared
dateStartInput.onchange = searchData;
dateEndInput.onchange = searchData;


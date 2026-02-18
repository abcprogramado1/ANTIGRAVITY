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

    // Special Case: Maestro Login
    if (input === '2@sotracor.com' && password === '123') {
        session = { email: input, role: 'super_admin', name: 'Super Administrador' };
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

    isAdmin = session.role === 'admin' || session.role === 'super_admin';
    const isSuperAdmin = session.role === 'super_admin';

    // Role Indicator
    if (isSuperAdmin) {
        userDisplayRole.innerHTML = '<span class="badge badge-admin">Acceso Total Maestro</span>';
        placaInput.readOnly = false;
        placaInput.placeholder = "Filtrar por placa o ver todo...";
        loadPlacaSelector(); // Cargar sugerencias de placas
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

        // Role-Based Filtering Logic
        const isSuperAdmin = session.role === 'super_admin';

        if (isSuperAdmin) {
            // SUPER_ADMIN Bypass: Only filter if a specific placa is entered
            if (placa) {
                query = query.ilike('Placa', `%${placa}%`);
            }
        } else if (isAdmin) {
            // Standard Admin: Usually wants to filter, but can be global too
            if (placa) {
                query = query.ilike('Placa', `%${placa}%`);
            }
        } else {
            // Propietario: Strict filter by Cedula
            query = query.eq('Cedula', session.cedula);
        }

        // Date Range Filtering
        const dateCol = 'Fecha';
        if (start) query = query.gte(dateCol, start);
        if (end) query = query.lte(dateCol, end);

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
    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.innerHTML = currentTab === 'Aportes' ? renderAporte(item) : renderGeneric(item);
        resultsContainer.appendChild(card);
    });
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

function renderAporte(item) {
    const vrAportes = item['Vr. Aportes'];
    const vrPlanilla = item['Vr. Planilla'];
    const pctStr = item['% Cump'] || '0';
    const pct = parseFloat(pctStr);
    const date = item['Fecha'] || item['Ult. Despacho'] || '-';

    let color = 'low';
    if (pct >= 80) color = 'high';
    else if (pct >= 50) color = 'mid';

    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Placa || 'REPORTE'}</span>
            <span class="report-date">${date}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">LIQUIDACIÓN DE APORTES</span>
                <div class="stat-row">
                    <span class="stat-value">${fmtMoney(vrAportes)}</span>
                    <span class="stat-info">Recaudado</span>
                </div>
                <div class="progress-bar" style="margin-top: 8px;">
                    <div class="progress-fill ${color}" style="width: ${Math.min(pct, 100)}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted);">CUMPLIMIENTO:</span>
                    <span class="badge ${pct >= 80 ? 'badge-green' : 'badge-yellow'}">${pct}%</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">DETALLES ECONÓMICOS</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Vr. Planilla:</span><span class="detail-value">${fmtMoney(vrPlanilla)}</span></div>
                    <div class="detail-item"><span class="detail-label">Nro Registro:</span><span class="detail-value">${item['No.'] || '-'}</span></div>
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


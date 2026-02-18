import { supabase } from './supabaseClient.js'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// --- State Management ---
let session = JSON.parse(localStorage.getItem('sotracor_session')) || null;
let isAdmin = session ? (session.role === 'admin' || session.role === 'ADMIN_TOTAL') : false;
let currentTab = 'Despachos';
let realtimeChannel = null;
let currentLoadedData = []; // Store search results for export

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

        const { data: prop } = await propQuery.single();

        if (prop) {
            if (prop.password === password) {
                await startPropietarioSession(prop);
                return;
            } else {
                alert('Contraseña incorrecta.');
                return;
            }
        } else {
            if (!input.includes('@')) {
                const numCedula = parseInt(input.replace(/[^0-9]+/g, ""));
                const { data: exists } = await supabase
                    .from('Aportes')
                    .select('Placa, Propietario')
                    .eq('Cedula', numCedula)
                    .limit(1)
                    .single();

                if (exists) {
                    const { error: insError } = await supabase
                        .from('perfiles_propietarios')
                        .insert([{
                            cedula: numCedula,
                            password: password,
                            email: null
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

    if (isTotalAdmin) {
        userDisplayRole.innerHTML = '<span class="badge badge-admin" style="background: #e11d48; border-color: #be123c;">MODO: ADMINISTRACIÓN GLOBAL</span>';
        placaInput.readOnly = false;
        placaInput.placeholder = "Filtrar cualquier vehículo o ver flota completa...";
        loadPlacaSelector();
        renderUploadCenter();
    } else if (isAdmin) {
        userDisplayRole.innerHTML = '<span class="badge badge-admin">Modo Administrador</span>';
        placaInput.readOnly = false;
        placaInput.placeholder = "Buscar cualquier placa...";
    } else {
        userDisplayRole.textContent = session.role;
        if (session.placaLinked) {
            placaInput.value = session.placaLinked;
            placaInput.readOnly = true;
            placaInput.style.background = '#f1f5f9';
        }
    }

    searchData();

    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === currentTab);
        btn.onclick = () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            searchData();
            if (isTotalAdmin) renderUploadCenter(); // Update button label
        };
    });
}

function renderUploadCenter() {
    let container = document.getElementById('upload-center-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'upload-center-container';
        container.className = 'sidebar-nav';
        container.style.marginTop = '2rem';
        document.querySelector('.sidebar-nav').after(container);
    }

    container.innerHTML = `
        <div class="nav-section">
            <span class="section-title">UPLOAD CENTER</span>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
                <button id="btn-trigger-upload" class="tab-btn" style="width: 100%; text-align: left; background: #f1f5f9; padding: 10px; display: flex; align-items: center; gap: 8px;">
                    📁 Cargar CSV (${currentTab})
                </button>
                <div id="upload-status" style="font-size: 0.65rem; color: var(--text-muted);">Listo para cargar</div>
                <div id="upload-progress" style="display:none; height: 4px; background: #eee; border-radius: 2px;">
                    <div id="upload-progress-fill" style="height:100%; background: var(--primary-green); width: 0%; border-radius: 2px;"></div>
                </div>
                <button id="btn-export-excel" class="tab-btn" style="width: 100%; text-align: left; background: #ecfdf5; color: #065f46; padding: 10px; display: flex; align-items: center; gap: 8px;">
                    📊 Exportar a Excel
                </button>
            </div>
        </div>
    `;

    const fileInput = document.getElementById('csv-file-input');
    const btnTrigger = document.getElementById('btn-trigger-upload');
    const btnExport = document.getElementById('btn-export-excel');

    btnTrigger.onclick = () => fileInput.click();
    fileInput.onchange = handleFileUpload;
    btnExport.onclick = exportToExcel;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('upload-status');
    const progress = document.getElementById('upload-progress');
    const fill = document.getElementById('upload-progress-fill');

    status.textContent = "Procesando archivo...";
    progress.style.display = 'block';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const rawData = results.data;
            const table = currentTab;
            status.textContent = `Limpiando ${rawData.length} registros...`;
            const cleanData = rawData.map(row => cleanRow(row, table));

            const chunkSize = 50;
            for (let i = 0; i < cleanData.length; i += chunkSize) {
                const chunk = cleanData.slice(i, i + chunkSize);
                const { error } = await supabase.from(table).insert(chunk);
                if (error) {
                    status.innerHTML = `<span style="color:red">Error: ${error.message}</span>`;
                    return;
                }
                const percent = Math.round(((i + chunk.length) / cleanData.length) * 100);
                fill.style.width = `${percent}%`;
                status.textContent = `Cargando: ${percent}%...`;
            }

            status.innerHTML = `<span style="color:green">¡Carga completa (${cleanData.length} filas)!</span>`;
            searchData();
        }
    });
}

function cleanRow(row, table) {
    const clean = {};
    for (let key in row) {
        let val = row[key];
        if (key.includes('Vr.') || key.includes('Tarifa') || key.includes('Total') || key.includes('Recaudo') || key.includes('Deuda')) {
            val = parseFloat(val?.toString().replace(/[^0-9.-]+/g, "")) || 0;
        }
        if (key === 'Fecha' && val) {
            const normalized = val.replace(/-/g, '/');
            if (normalized.includes('/')) {
                const parts = normalized.split('/');
                if (parts.length === 3) {
                    const [d, m, y] = parts;
                    val = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
            }
        }
        clean[key] = val;
    }
    return clean;
}

function exportToExcel() {
    if (!currentLoadedData || currentLoadedData.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }
    const ws = XLSX.utils.json_to_sheet(currentLoadedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentTab);
    XLSX.writeFile(wb, `Reporte_Sotracor_${currentTab}_${new Date().getTime()}.xlsx`);
}

async function searchData() {
    const start = dateStartInput.value;
    const end = dateEndInput.value;
    const placa = placaInput.value.trim().toUpperCase();
    resultsContainer.innerHTML = '<div class="placeholder-view"><p class="placeholder-text">Cargando registros...</p></div>';

    try {
        let query = supabase.from(currentTab).select('*');
        if (session.role === 'ADMIN_TOTAL' || isAdmin) {
            if (placa) query = query.ilike('Placa', `%${placa}%`);
        } else {
            query = query.eq('Cedula', session.cedula);
        }

        const dateCol = 'Fecha';
        if (start) query = query.gte(dateCol, start);
        if (end) query = query.lte(dateCol, end);

        const { data, error } = await query.order(dateCol, { ascending: false }).limit(100);
        if (error) throw error;
        currentLoadedData = data;
        renderResults(data);
        setupRealtime();
    } catch (err) {
        resultsContainer.innerHTML = `<div class="placeholder-view"><p class="placeholder-text" style="color: #ef4444;">Error: ${err.message}</p></div>`;
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
        resultsContainer.innerHTML = '<div class="placeholder-view"><p class="placeholder-text">No se hallaron registros.</p></div>';
        return;
    }

    let totalPlanilla = 0, totalAportes = 0, sumCumplimiento = 0, countAportes = 0;
    let totalTarifaT = 0, totalDescuentoT = 0, totalRecaudadoT = 0, totalProyectadoT = 0;

    data.forEach(item => {
        if (currentTab === 'Aportes') {
            totalPlanilla += parseFloat(item["Vr. Planilla"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            totalAportes += parseFloat(item["Vr. Aportes"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            sumCumplimiento += parseFloat(item["% Cump"]?.toString().replace(',', '.')) || 0;
            countAportes++;
        }
        if (currentTab === 'Tiquetes') {
            const t = parseFloat(item["Tarifa"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const d = parseFloat(item["Vr. Descuento"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            const r = parseFloat(item["Vr. Recaudo"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
            if (String(item["Electronico"]) === "1") {
                totalTarifaT += t; totalDescuentoT += d; totalRecaudadoT += r;
            }
            totalProyectadoT += r;
        }

        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.innerHTML = currentTab === 'Aportes' ? renderAporte(item) :
            currentTab === 'Tiquetes' ? renderTiquete(item) : renderGeneric(item);
        resultsContainer.appendChild(card);
    });

    if (currentTab === 'Tiquetes' && data.length > 0) {
        const tSummary = document.createElement('div');
        tSummary.className = 'vehicle-card summary-card';
        tSummary.style.gridColumn = '1 / -1';
        tSummary.style.border = '2px solid #5b21b6';
        tSummary.style.background = '#f5f3ff';
        tSummary.innerHTML = `
            <div class="card-header" style="background: #5b21b6; color: white;">
                <span class="vehicle-number" style="background: white; color: #5b21b6;">RESUMEN TIQUETEO</span>
            </div>
            <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                <div class="card-section">
                    <span class="section-label">TIQUETEO</span>
                    <div class="detail-list">
                        <div class="detail-item"><span class="detail-label">Tarifa Total:</span><span class="detail-value">${fmtMoney(totalTarifaT)}</span></div>
                        <div class="detail-item"><span class="detail-label">Descuentos:</span><span class="detail-value" style="color: #ef4444;">-${fmtMoney(totalDescuentoT)}</span></div>
                        <div class="detail-item" style="border-top: 1px solid #ddd; padding-top: 8px;"><span class="detail-label" style="font-weight: 800;">RECAUDADO:</span><span class="detail-value" style="color: #16a34a; font-size: 1.1rem;">${fmtMoney(totalRecaudadoT)}</span></div>
                    </div>
                </div>
                <div class="card-section" style="border-left: 1px dashed #ddd; padding-left: 1.5rem;">
                    <span class="section-label">PROYECCIÓN GLOBAL</span>
                    <div class="stat-row"><span class="stat-value" style="color: #4338ca;">${fmtMoney(totalProyectadoT)}</span></div>
                    <span class="stat-info">TIQUETEO PROYECTADO</span>
                </div>
            </div>`;
        resultsContainer.prepend(tSummary);
    }
    if (isAdmin && data.length > 1 && currentTab === 'Aportes') {
        const avg = (sumCumplimiento / countAportes).toFixed(2);
        const aSummary = document.createElement('div');
        aSummary.className = 'vehicle-card summary-card';
        aSummary.style.border = '2px solid var(--primary-blue)';
        aSummary.style.background = '#f0f9ff';
        aSummary.innerHTML = `
            <div class="card-header" style="background: var(--primary-blue); color: white;">
                <span class="vehicle-number" style="background: white; color: var(--primary-blue);">TOTALES</span>
                <span class="report-date">${data.length} VEHÍCULOS</span>
            </div>
            <div class="card-body">
                <div class="card-section">
                    <span class="section-label">TOTAL RECAUDADO FLOTA</span>
                    <div class="stat-row"><span class="stat-value" style="color: var(--primary-blue);">${fmtMoney(totalAportes)}</span><span class="stat-info">Vr. Aportes</span></div>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px;"><span style="font-size: 0.75rem; font-weight: 700;">PROMEDIO CUMP:</span><span class="badge ${avg >= 80 ? 'badge-green' : 'badge-yellow'}">${avg}%</span></div>
                </div>
                <div class="card-section" style="margin-top: 15px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                    <div class="detail-list"><div class="detail-item"><span class="detail-label">Total Planilla:</span><span class="detail-value">${fmtMoney(totalPlanilla)}</span></div></div>
                </div>
            </div>`;
        resultsContainer.appendChild(aSummary);
    }
}

const fmtMoney = (v) => {
    let val = v;
    if (typeof v === 'string') val = parseFloat(v.replace(/[^0-9.-]+/g, ""));
    if (isNaN(val) || val === null) return '$0';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const fmtDate = (d) => {
    if (!d) return '-';
    if (d.includes('-') && d.split('-')[0].length === 4) {
        const [y, m, d_part] = d.split('-');
        return `${d_part}/${m}/${y}`;
    }
    return d;
};

function renderTiquete(item) {
    const t = parseFloat(item["Tarifa"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const d = parseFloat(item["Vr. Descuento"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const r = parseFloat(item["Vr. Recaudo"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const e = (item["Estado Envio"] || "SIN ESTADO").toUpperCase();
    return `
        <div class="card-header"><span class="vehicle-number">${item.Placa || 'TKT'}</span><span class="report-date">${fmtDate(item.Fecha)}</span></div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">TIQUETE: ${item["No. Tiquete"] || '-'}</span>
                <div class="stat-row"><span class="stat-value">${fmtMoney(r)}</span><span class="stat-info">Recaudado</span></div>
                <div class="badge ${e === 'DOCUMENTO ENVIADO' ? 'badge-green' : 'badge-yellow'}" style="margin-top: 8px; font-size: 0.6rem;">${e}</div>
            </div>
            <div class="card-section">
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Tarifa:</span><span class="detail-value">${fmtMoney(t)}</span></div>
                    <div class="detail-item"><span class="detail-label">Descuento:</span><span class="detail-value" style="color: #ef4444;">${d > 0 ? '-' : ''}${fmtMoney(d)}</span></div>
                    <div class="detail-item"><span class="detail-label">Pasajero:</span><span class="detail-value" style="font-size: 0.7rem;">${item["Nombre del Pasajero"] || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderAporte(item) {
    const vA = parseFloat(item["Vr. Aportes"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const vP = parseFloat(item["Vr. Planilla"]?.toString().replace(/[^0-9.-]+/g, "")) || 0;
    const pN = parseFloat(item["% Cump"]?.toString().replace(',', '.')) || 0;
    let color = pN >= 80 ? 'high' : pN >= 50 ? 'mid' : 'low';
    return `
        <div class="card-header"><span class="vehicle-number">${item.Placa || 'FLOTA'}</span><span class="report-date">${fmtDate(item.Fecha)}</span></div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">LIQUIDACIÓN DE FLOTA</span>
                <div class="stat-row"><span class="stat-value">${fmtMoney(vA)}</span><span class="stat-info">Vr. Aportes</span></div>
                <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill ${color}" style="width: ${Math.min(pN, 100)}%;"></div></div>
                <div style="display:flex; justify-content:space-between; margin-top:4px;"><span style="font-size:0.65rem; font-weight:700; color:var(--text-muted);">% CUMP:</span><span class="badge ${pN >= 80 ? 'badge-green' : 'badge-yellow'}">${pN}%</span></div>
            </div>
            <div class="card-section">
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Vr. Planilla:</span><span class="detail-value">${fmtMoney(vP)}</span></div>
                    <div class="detail-item"><span class="detail-label">Propietario:</span><span class="detail-value" style="font-size:0.7rem;">${item.Propietario || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderGeneric(item) {
    const v = item['Valor Total'] || item['Total Deuda'] || item['Vr. Aporte'] || '0';
    return `
        <div class="card-header"><span class="vehicle-number">${item.Placa || 'V-00'}</span><span class="report-date">${fmtDate(item.Fecha)}</span></div>
        <div class="card-body"><div class="stat-row"><span class="stat-value">${fmtMoney(v)}</span><span class="stat-info">Importe</span></div>
        <div class="detail-list" style="margin-top:1rem;"><div class="detail-item"><span class="detail-label">Referencia:</span><span class="detail-value">${item.Ruta || item.Concepto || item.Agencia || '-'}</span></div></div></div>`;
}

async function loadPlacaSelector() {
    const { data } = await supabase.from('Aportes').select('Placa');
    if (!data) return;
    const unique = [...new Set(data.map(i => i.Placa))].filter(Boolean).sort();
    let datalist = document.getElementById('placa-list') || document.createElement('datalist');
    datalist.id = 'placa-list'; document.body.appendChild(datalist);
    placaInput.setAttribute('list', 'placa-list');
    datalist.innerHTML = unique.map(p => `<option value="${p}">`).join('');
}

btnDoLogin.onclick = login;
btnLogout.onclick = logout;
placaInput.onkeypress = (e) => { if (e.key === 'Enter') searchData(); };
placaInput.oninput = () => { if (placaInput.value === '') searchData(); };
dateStartInput.onchange = searchData;
dateEndInput.onchange = searchData;

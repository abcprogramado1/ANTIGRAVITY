
import { supabase } from './supabaseClient.js'

let currentTab = 'Despachos';
let currentPlaca = '';
let realtimeChannel = null;

const placaInput = document.getElementById('placa-input');
const resultsContainer = document.getElementById('results-container');
const tabButtons = document.querySelectorAll('.tab-btn');

// --- Initialization ---

// Add event listeners to tabs
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.getAttribute('data-tab');
        if (currentPlaca) {
            searchData();
        }
    });
});

// Search on enter
placaInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        currentPlaca = placaInput.value.trim().toUpperCase();
        if (currentPlaca) {
            searchData();
        }
    }
});

// --- Core Logic ---

async function searchData() {
    if (!currentPlaca) return;

    resultsContainer.innerHTML = '<div class="placeholder-view"><p class="placeholder-text">Consultando datos en tiempo real...</p></div>';

    try {
        // Query the selected table filtered by Placa
        const { data, error } = await supabase
            .from(currentTab)
            .select('*')
            .eq('Placa', currentPlaca)
            .order('Fecha', { ascending: false })
            .limit(20);

        if (error) throw error;

        renderResults(data);
        setupRealtime();

    } catch (err) {
        console.error('Error fetching data:', err);
        resultsContainer.innerHTML = `<div class="placeholder-view"><p class="placeholder-text" style="color: #ef4444;">Error: ${err.message}</p></div>`;
    }
}

function setupRealtime() {
    // Cleanup previous channel
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }

    // Subscribe to changes on the current table and placa
    realtimeChannel = supabase.channel(`public:${currentTab}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: currentTab,
            filter: `Placa=eq.${currentPlaca}`
        }, payload => {
            console.log('Realtime change detected:', payload);
            searchData(); // Refresh data on change
        })
        .subscribe();
}

function renderResults(data) {
    resultsContainer.innerHTML = '';

    if (!data || data.length === 0) {
        resultsContainer.innerHTML = `
            <div class="placeholder-view">
                <p class="placeholder-text">No se hallaron registros para la placa ${currentPlaca} en ${currentTab}.</p>
            </div>`;
        return;
    }

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'vehicle-card';

        let cardHtml = '';

        if (currentTab === 'Despachos') {
            cardHtml = renderDespacho(item);
        } else if (currentTab === 'Cartera') {
            cardHtml = renderCartera(item);
        } else if (currentTab === 'Tiquetes') {
            cardHtml = renderTiquete(item);
        } else if (currentTab === 'Aportes') {
            cardHtml = renderAporte(item);
        }

        card.innerHTML = cardHtml;
        resultsContainer.appendChild(card);
    });
}

// --- Specific Rendering Functions ---

function renderDespacho(item) {
    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Numero || 'N/A'}</span>
            <span class="report-date">${item.Fecha || ''}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">LIQUIDACIÓN DESPACHO</span>
                <div class="stat-row">
                    <span class="stat-value">${item['Vr. Aporte'] || '$0'}</span>
                    <span class="stat-info">Recaudado</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">DETALLES</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Conductor:</span><span class="detail-value">${item.Conductor || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Ruta:</span><span class="detail-value">${item.Ruta || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Obs:</span><span class="detail-value">${item.Observacion || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderCartera(item) {
    return `
        <div class="card-header">
            <span class="vehicle-number">${item.Documento || 'DOC'}</span>
            <span class="report-date">${item.Fecha || ''}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">SALDO PENDIENTE</span>
                <div class="stat-row">
                    <span class="stat-value" style="color: #ef4444;">${item['Total Deuda'] || '$0'}</span>
                    <span class="stat-info">A pagar</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">CONCEPTO</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Concepto:</span><span class="detail-value">${item.Concepto || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Vencimiento:</span><span class="detail-value">${item.Vencimiento || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Propietario:</span><span class="detail-value">${item['Nombre del Propietario'] || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderTiquete(item) {
    return `
        <div class="card-header">
            <span class="vehicle-number">${item['No. Tiquete'] || 'TIQ'}</span>
            <span class="report-date">${item.Fecha || ''}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">VALOR TIQUETE</span>
                <div class="stat-row">
                    <span class="stat-value">${item['Valor Total'] || '$0'}</span>
                    <span class="stat-info">Pasaje</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">DATOS VIAJE</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Pasajero:</span><span class="detail-value">${item['Nombre del Pasajero'] || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Agencia:</span><span class="detail-value">${item.Agencia || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Destino:</span><span class="detail-value">${item['Destino Pasajero'] || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderAporte(item) {
    return `
        <div class="card-header">
            <span class="vehicle-number">APORTE</span>
            <span class="report-date">${item['Ult. Despacho'] || ''}</span>
        </div>
        <div class="card-body">
            <div class="card-section">
                <span class="section-label">TOTAL APORTES</span>
                <div class="stat-row">
                    <span class="stat-value">${item['Vr. Aportes'] || '$0'}</span>
                    <span class="stat-info">Sinaltrainal</span>
                </div>
            </div>
            <div class="card-section">
                <span class="section-label">ESTADO DE CUENTA</span>
                <div class="detail-list">
                    <div class="detail-item"><span class="detail-label">Vr. Planilla:</span><span class="detail-value">${item['Vr. Planilla'] || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Propietario:</span><span class="detail-value">${item.Propietario || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Estado:</span><span class="detail-value">${item.Estado || '-'}</span></div>
                </div>
            </div>
        </div>`;
}

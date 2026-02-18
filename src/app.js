
import { supabase } from './supabaseClient.js'

const searchBtn = document.getElementById('search-btn');
const placaInput = document.getElementById('placa-input');
const resultsContainer = document.getElementById('results-container');

async function searchReport() {
    const placa = placaInput.value.trim().toUpperCase();

    if (!placa) {
        alert('Por favor ingrese una placa.');
        return;
    }

    resultsContainer.innerHTML = '<p class="placeholder-text">Cargando reportes...</p>';

    try {
        // Query 'Despachos' table directly
        let { data, error } = await supabase
            .from('Despachos')
            .select('*')
            .ilike('Placa', `%${placa}%`)
            .limit(20);

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<p class="placeholder-text">No se encontraron reportes para esta placa.</p>';
            return;
        }

        renderResults(data);

    } catch (err) {
        console.error('Error searching:', err);
        resultsContainer.innerHTML = `<p class="placeholder-text" style="color: #ef4444;">Error al consultar: ${err.message}</p>`;
    }
}

function renderResults(reports) {
    resultsContainer.innerHTML = '';

    if (reports.length === 0) {
        resultsContainer.innerHTML = `
            <div class="placeholder-view">
                <p class="placeholder-text">No se encontraron resultados para esta placa.</p>
            </div>`;
        return;
    }

    reports.forEach(report => {
        const card = document.createElement('div');
        card.className = 'vehicle-card';

        // Map database fields to UI
        const placa = report.Placa || report.placa || 'SIN PLACA';
        const numInterno = report.Numero || report['Codigo Vehiculo'] || 'S.N.';
        const aporteValue = report['Vr. Aporte'] || '$0';
        const conductor = report.Conductor || 'No asignado';
        const fecha = report.Fecha || 'Sin fecha';
        const observacion = report.Observacion || 'Sin observaciones';
        const ruta = report.Ruta || 'Sin ruta';
        const empresa = report['Empresa Vehiculo'] || 'Sotracor S.A.';

        card.innerHTML = `
            <div class="card-header">
                <span class="vehicle-number">${numInterno}</span>
                <span class="report-date">${fecha}</span>
            </div>
            <div class="card-body">
                <div class="card-section">
                    <span class="section-label">LIQUIDACIÓN DIARIA</span>
                    <div class="stat-row">
                        <span class="stat-value">${aporteValue}</span>
                        <span class="stat-info">Recaudado</span>
                    </div>
                </div>

                <div class="card-section">
                    <span class="section-label">INFORMACIÓN DEL VEHÍCULO</span>
                    <div class="detail-list">
                        <div class="detail-item">
                            <span class="detail-label">Placa:</span>
                            <span class="detail-value">${placa}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Empresa:</span>
                            <span class="detail-value">${empresa}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Conductor:</span>
                            <span class="detail-value">${conductor}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Ruta:</span>
                            <span class="detail-value">${ruta}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Observaciones:</span>
                            <span class="detail-value">${observacion}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        resultsContainer.appendChild(card);
    });
}

searchBtn.addEventListener('click', searchReport);

placaInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchReport();
    }
});

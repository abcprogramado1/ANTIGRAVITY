
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
        // Attempt query on 'reportes' table first as per instructions
        let { data, error } = await supabase
            .from('reportes')
            .select('*')
            .ilike('placa', `%${placa}%`); // Using ilike for partial/case-insensitive match

        if (error) {
            console.error('Error fetching from reportes:', error);

            // Fallback: If table 'reportes' not found, try 'Despachos' (common alternative in transport context)
            // This is a safety measure if the table name was mistaken in instructions.
            if (error.code === '42P01') { // undefined_table
                console.warn("Table 'reportes' not found. Falling back to 'Despachos'.");
                const fallback = await supabase
                    .from('Despachos')
                    .select('*')
                    .ilike('Placa', `%${placa}%`)
                    .limit(20); // Limit results for performance

                if (fallback.error) {
                    throw fallback.error;
                }
                data = fallback.data;
            } else {
                throw error;
            }
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

    reports.forEach(report => {
        const card = document.createElement('div');
        card.className = 'report-card';

        // Create specific fields based on expected data or fallback
        // Assuming 'reportes' has standard fields or falling back to generic object rendering

        let contentHtml = '';

        // Attempt to identify key fields for a nice display
        const date = report.fecha || report.created_at || report.Fecha || 'Fecha desconocida';
        const title = report.titulo || report.tipo || report['Tipo Planilla'] || 'Reporte';
        const description = report.descripcion || report.Observacion || 'Sin descripción';

        contentHtml = `
      <div class="report-header">
        <span class="report-title">${title}</span>
        <span class="report-date">${date}</span>
      </div>
      <div class="report-body">
        <p><strong>Placa:</strong> ${report.placa || report.Placa}</p>
        <p>${description}</p>
        ${report.Conductor ? `<p><strong>Conductor:</strong> ${report.Conductor}</p>` : ''}
        ${report.Ruta ? `<p><strong>Ruta:</strong> ${report.Ruta}</p>` : ''}
      </div>
    `;

        card.innerHTML = contentHtml;
        resultsContainer.appendChild(card);
    });
}

searchBtn.addEventListener('click', searchReport);

placaInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchReport();
    }
});

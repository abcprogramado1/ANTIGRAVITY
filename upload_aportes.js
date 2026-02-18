import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import csv from 'csv-parser';

// Configuración de tu proyecto
const supabase = createClient(
    'https://ewpmmjgizixhrjfrjede.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3cG1tamdpeml4aHJqZnJqZWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTMyMDcsImV4cCI6MjA4Njg4OTIwN30.c-vjwAfo7NfBkLTNeQYs_Xxsg_QgNl-Mx9BhlQWRG78'
);

// Ruta absoluta al archivo CSV
const csvPath = 'd:\\CARPETA TRABAJO ASESOR GERENCIA\\Downloads\\SOTRACOR\\0.SOTRACOR 2026\\PLAN 2026\\aplicaciones 2026\\Aportes.csv';

const results = [];

console.log('--- Iniciando carga de datos Aportes.csv ---');

fs.createReadStream(csvPath)
    .pipe(csv({ separator: ';' }))
    .on('data', (data) => {
        const row = {};
        for (const key in data) {
            // Limpieza dinámica basada en el nombre de la columna
            if (['No.', 'Cedula', 'CC', 'Subcentro'].includes(key)) {
                row[key] = data[key] ? parseInt(data[key].replace(/[^0-9]+/g, "")) : null;
            } else if (key === '% Cump') {
                row[key] = data[key]?.replace(',', '.') || '0';
            } else if (key.startsWith('Vr.')) {
                // Limpiamos símbolos de moneda y comas para que sean números válidos si decides cambiar el tipo en la DB
                // Aunque la DB actual sea 'text', esto los estandariza.
                row[key] = data[key]?.replace(/[^0-9.-]+/g, "") || '0';
            } else {
                row[key] = data[key];
            }
        }
        results.push(row);
    })
    .on('end', async () => {
        console.log(`Archivo leído: ${results.length} filas.`);

        if (results.length === 0) {
            console.log('No hay datos.');
            return;
        }

        // Limpiamos la tabla para evitar duplicados, ya que los datos parecen ser los mismos
        console.log('Limpiando datos previos de la tabla "Aportes"...');
        const { error: delError } = await supabase.from('Aportes').delete().neq('Placa', 'EMPTY_VAL_FOR_TRUNCATE');

        if (delError) {
            console.error('Error al limpiar la tabla:', delError.message);
        }

        console.log('Subiendo nuevos datos en bloques...');
        for (let i = 0; i < results.length; i += 100) {
            const chunk = results.slice(i, i + 100);
            const { error } = await supabase.from('Aportes').insert(chunk);

            if (error) {
                console.error(`Error en bloque ${i}:`, error.message);
            } else {
                console.log(`Bloque ${i} al ${Math.min(i + 100, results.length)} subido.`);
            }
        }
        console.log('--- Proceso completado con éxito ---');
    })
    .on('error', (err) => {
        console.error('Error de lectura:', err.message);
    });

const logger = require('../config/logger');
const xlsx = require('xlsx');

const writeNewRowOnTemplate = (worksheet, newRow) => {
    // Trova la prossima riga vuota nel foglio di destinazione
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const nextRowNum = range.e.r + 1;

    // Aggiungi i dati alla riga
    for (let col = 0; col < newRow.length; col++) {
        const cellAddress = xlsx.utils.encode_cell({ r: nextRowNum, c: col });
        const value = newRow[col] || '';

        // Determina il tipo della cella
        let cellType = 's'; // Default: stringa
        if (col === 1 && value !== '') { // Colonna import_transaction
            cellType = 'n'; // 'n' indica un numero
            worksheet[cellAddress] = { v: value, t: cellType, z: '0.00' }; // Formattazione numerica
            continue;
        } else if (col === 3 && value !== '') { // Colonna data
            // Converte la data in formato Excel
            const jsDate = excelDateToJSDate(value);
            const normalizedDate = normalizeDate(jsDate); // Rimuove orario
            cellType = 'd'; // 'd' indica una data
            worksheet[cellAddress] = { v: normalizedDate, t: cellType, z: 'dd/mm/yyyy' }; // Formattazione data
            continue;
        }

        // Scrivi la cella
        worksheet[cellAddress] = { v: value, t: cellType };
    }

    // Aggiorna il range del foglio
    worksheet['!ref'] = xlsx.utils.encode_range(range.s, { r: nextRowNum, c: range.e.c });
}

const updateTemplate = (worksheet) => {
    var rangee = xlsx.utils.decode_range(worksheet['!ref']);
    var colNum = xlsx.utils.decode_col("B"); // Colonna numerica (es. B per il netto)
    var colDate = xlsx.utils.decode_col("D"); // Colonna data (es. D per la data)
    var fmtNumber = '0.00'; // Formattazione numerica
    var fmtDate = 'dd/mm/yy'; // Formattazione data

    // Applicare formattazione a tutte le celle della colonna numerica e della colonna data
    for (var i = rangee.s.r + 1; i <= rangee.e.r; ++i) {
        // Applicare formattazione alla colonna numerica
        var refNum = xlsx.utils.encode_cell({ r: i, c: colNum });
        if (worksheet[refNum] && worksheet[refNum].t === 'n') { // Se è un numero
            worksheet[refNum].z = fmtNumber; // Applica formattazione numerica
        }

        // Applicare formattazione alla colonna data
        var refDate = xlsx.utils.encode_cell({ r: i, c: colDate });
        if (worksheet[refDate]) { // Se è una data
            worksheet[refDate].z = fmtDate; // Applica formattazione data
        }
    }
}

/**
 * given a date string like 'dd/mm/yyyy' it return the serial number date
 * @param {string} dateStr 
 * @returns {number} days since 1 jan 1900
 */
const parseDate = (dateStr) => {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    let numeroSeriale = 25569.0 + ((date.getTime() - (date.getTimezoneOffset() * 60 * 1000)) / (1000 * 60 * 60 * 24))
    return numeroSeriale;
}

function excelDateToJSDate(excelDate) {
    // La base di Excel è il 1 gennaio 1900 (seriale 1)
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Converti in millisecondi
    return jsDate;
}

function normalizeDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

module.exports = { writeNewRowOnTemplate, updateTemplate, parseDate };
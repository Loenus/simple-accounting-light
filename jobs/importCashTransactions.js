const cron = require('node-cron');
const logger = require('../config/logger');
const Excel = require('exceljs');
const fs = require('fs');
const xlsx = require('xlsx');

const workbook = new Excel.Workbook();
const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const INPUT_FILE_PATH = process.env.INPUT_FILE_PATH;


async function performDailyTask() {
    // recuperare da un file di testo le transazioni cash con una regex
    // metterle nel file di template
    // eliminare le transazioni recuperate dal file testo

    // Leggere il file di testo
    const fileData = fs.readFileSync(INPUT_FILE_PATH, 'utf8');
    //const lines = fileData.split('\n'); // Divide il contenuto in righe
    //const dataWithoutFirstLine = lines.slice(1).join('\n'); // Unisce di nuovo senza la prima riga


    // Regex per trovare tutte le transazioni nel formato "Beneficiario:Soldi,"
    //const regex = /([^:]+):([^,]+),/g; //non funzionava in tutti i casi
    //const regex = /(\b[^:,]+):(\d+),?/g;
    //const regex2 = /(\b[^(:]+)(?:\s*\(([^)]+)\))?\s*:\s*(\d+),?/g;
    const regex2 = /(\b[^(:]+)(?:\s*\(([^)]+)\))?\s*:\s*(\d+)\s*,?/g;
    const transactions = [];
    let match;

    /*while ((match = regex.exec(fileData)) !== null) {
        const [_, beneficiario, soldi] = match;
        transactions.push({ Beneficiario: beneficiario.trim(), Soldi: parseFloat(soldi.trim()) });
    }*/
    while ((match = regex2.exec(fileData)) !== null) {
        const [_, beneficiario, luogo, soldi] = match; // Destrutturazione
        transactions.push({
            Beneficiario: beneficiario.trim(),
            Luogo: luogo ? luogo.trim() : null, // Se luogo è undefined, assegna null
            Soldi: parseInt(soldi, 10),
        });
    }
    logger.info(`Trovate ${transactions.length} transazioni cash da inserire!`)
    console.log(transactions)

    // Scrivere le transazioni nel file Excel
    //await workbook.xlsx.readFile(FILE_PATH_TEMPLATE); // Carica il file template
    //const worksheet = workbook.getWorksheet(1); // Assume che stia usando il primo foglio
    const workbook = xlsx.readFile(FILE_PATH_TEMPLATE);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    transactions.forEach((transaction) => {
        const dateInput = new Date().toLocaleDateString('it-IT');
        const date = parseDate(dateInput.toString());
        const row = [
            null,
            -transaction.Soldi,
            'EUR',
            date,
            'CASH',
            transaction.Beneficiario,              
            ''
        ];
        try {
            writeNewRowOnTemplate(worksheet, row);
        } catch (error) {
            console.log(error)
        }
    });

    updateTemplate(worksheet);

    xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
    console.log("completato salvataggio")

    // Rimuovere le transazioni elaborate dal file originale
    //const updatedFileData = fileData.replace(regex2, '').trim();
    //fs.writeFileSync(INPUT_FILE_PATH, updatedFileData, 'utf8');
}

function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    let numeroSeriale = 25569.0 + ((date.getTime() - (date.getTimezoneOffset() * 60 * 1000)) / (1000 * 60 * 60 * 24))
    return numeroSeriale;
}

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
function excelDateToJSDate(excelDate) {
    // La base di Excel è il 1 gennaio 1900 (seriale 1)
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Converti in millisecondi
    return jsDate;
}
function normalizeDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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













// Configurazione del cronjob
const dailyTask = () => {
    cron.schedule('0 1 * * *', async () => {
        logger.info('Inizio task giornaliero alle 2:00 AM');
        try {
            await performDailyTask();
            logger.info('Task giornaliero completato con successo.');
        } catch (error) {
            logger.error(`Errore durante il task giornaliero: ${error.message}`);
        }
    });
};


module.exports = { dailyTask, performDailyTask };

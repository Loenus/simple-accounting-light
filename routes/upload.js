const express = require('express');
const logger = require('../config/logger');
const upload = require('../config/multerConfig'); // Configurazione di Multer
const ExcelJS = require('exceljs');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const fs = require('fs')
const xlsx = require('xlsx');

let isUploadInProgress = false; // Variabile per indicare se un upload è in corso
const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const TEMP_FILE_PATH = process.env.TEMP_FILE_PATH;

const router = express.Router();

router.post('/upload', upload.single('file'), async (req, res) => {
    if (isUploadInProgress) {
        return res.status(429).json({
            type: 'error',
            text: 'Un altro upload è già in corso. Riprova più tardi.',
        });
    }
    isUploadInProgress = true; // Blocca nuove richieste
    
    try {
        // Controlla se un file è stato caricato
        if (!req.file) {
            return res.status(400).json({
                type: 'error',
                text: 'Nessun file csv/xls/xlsx caricato.'
            });
        }

        const selectedService = req.body.service;
        switch (selectedService) {
            case 'intesa':
                intesaInput(req,res);
                break;
            case 'paypal':
                paypalInput(req,res);
                break;
            default:
                return res.status(400).json({
                    type: 'error',
                    text: `Service non disponibile: ${selectedService}`
                }); 
        }

        logger.info('File output aggiornato con successo!');
        res.json({
            type: 'success',
            text: `File elaborato con successo: ${req.file.originalname}`
        });
    } catch (error) {
        logger.error(`Errore durante l'elaborazione: ${error}`);
        res.status(500).json({
            type: 'error',
            text: 'CARICAMENTO FALLITO, erorre generico durante l\'elaborazione del file'
        })
    } finally {
        isUploadInProgress = false; // Consenti nuove richieste
    }
});

// necessario perhé nel csv di paypal alcune chiavi hanno doppi apici e altre singoli
const normalizeKeys = (row) => {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
            key.trim().replace(/"/g, ''), // Rimuove spazi e doppi apici
            value
        ])
    );
};

// TODO: impedire il caricamento di un file paypal come un file intesa e viceversa

// TODO: questo fa upload nel file di brutta in cui ci sono tutte le transazioni.
// poi daily task che trasporta esattamente queste transazioni, però in un excel formattato con un report (usando ExcelJS)


const intesaInput = (req, res) => {
    logger.info(`File caricato in memoria per lettura: ${req.file.originalname}`);
    
    // Carica il file caricato in memoria
    const workbook2 = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet2 = workbook2.Sheets[workbook2.SheetNames[0]]; // Prendi il primo foglio

    // Carica il file template
    const workbook = xlsx.readFile(FILE_PATH_TEMPLATE);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    // Leggi i dati dal primo file e scrivi al template
    const data2 = xlsx.utils.sheet_to_json(worksheet2, { header: 1 }); // Converte in array di array
    const startRow = 19; // Riga da cui iniziare (riga 20 in Excel)

    data2.forEach((row, rowIndex) => {
        if (rowIndex < startRow) return;
        const import_transaction = row[7] || '';
        if (!import_transaction) return;
        const currency = row[6] || '';
        const date = row[0]; // Numero seriale
        const counterparty = row[1] || '';
        const description = row[2] || '';

        // Aggiungi una nuova riga al foglio del template
        const newRow = [
            null,
            import_transaction,
            currency,
            date,
            'INTESA SANPAOLO',
            counterparty,
            description
        ];

        writeNewRowOnTemplate(worksheet, newRow);
    });

    updateTemplate(worksheet);

    // Salva il file di output
    xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
}

function excelDateToJSDate(excelDate) {
    // La base di Excel è il 1 gennaio 1900 (seriale 1)
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000); // Converti in millisecondi
    return jsDate;
}

function normalizeDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}



const paypalInput = (req, res) => {
    const readableStream = Readable.from(req.file.buffer);
    const results = []; // Array to store the parsed data

    // Leggi il file Excel template
    const workbook = xlsx.readFile(FILE_PATH_TEMPLATE);
    let worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Ottieni il primo foglio

    // Leggi e parse il CSV
    readableStream
        .pipe(csvParser())
        .on('data', (row) => {
            const normalizedRow = normalizeKeys(row);
            results.push(normalizedRow);
        })
        .on('end', () => {
            // Aggiungi tutte le righe dal CSV al foglio Excel
            results.forEach((row) => {
                const date = row['Data'] ? parseDate(row['Data']) : null;
                let formatted_netto = row['Netto'].replace(",", ".");
                let floatValue = parseFloat(formatted_netto);
                const newRow = [
                    null,
                    floatValue || '',
                    row['Valuta'] || '',
                    date || '',
                    'PAYPAL',
                    row['Nome'] || '',
                    row['Descrizione'] || ''
                ];

                writeNewRowOnTemplate(worksheet, newRow);
            });

            updateTemplate(worksheet);

            // Salva il file aggiornato
            xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
        })
        .on('error', (err) => {
            res.status(500).json({ error: 'Errore durante l’elaborazione del file', details: err.message });
        });
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

// Funzione per convertire una stringa 'dd/mm/yyyy' in un oggetto Date
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    let numeroSeriale = 25569.0 + ((date.getTime() - (date.getTimezoneOffset() * 60 * 1000)) / (1000 * 60 * 60 * 24))
    return numeroSeriale;
}


module.exports = router;

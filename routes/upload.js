const express = require('express');
const logger = require('../config/logger');
const upload = require('../config/multerConfig'); // Configurazione di Multer
const Excel = require('exceljs');
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


const intesaInput = (req, res) => {
    logger.info(`File caricato in memoria per lettura: ${req.file.originalname}`);
    
    // Carica il file caricato in memoria
    const workbook2 = xlsx.read(req.file.buffer, { type: 'buffer' });
    const worksheet2 = workbook2.Sheets[workbook2.SheetNames[0]]; // Prendi il primo foglio

    // Carica il file template
    const templatePath = FILE_PATH_TEMPLATE;
    const workbook = xlsx.readFile(templatePath);
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

        // Trova la prossima riga vuota nel foglio di destinazione
        const range = xlsx.utils.decode_range(worksheet['!ref']);
        const nextRowNum = range.e.r + 1; // Prossima riga disponibile
        //const cellStart = xlsx.utils.encode_cell({ r: nextRowNum, c: 0 });
        //const cellEnd = xlsx.utils.encode_cell({ r: nextRowNum, c: newRow.length - 1 });

        // Aggiungi i dati
        for (let col = 0; col < newRow.length; col++) {
            const cellAddress = xlsx.utils.encode_cell({ r: nextRowNum, c: col });
            const value = newRow[col] || '';

            // Determina il tipo della cella
            let cellType = 's'; // Default: stringa
            if (col === 1 && value !== '') { // Colonna import_transaction
                cellType = 'n'; // 'n' indica un numero
            } else if (col === 3) { // Colonna data
                // Converte il numero Excel in oggetto Date
                const jsDate = excelDateToJSDate(value);
                const normalizedDate = normalizeDate(jsDate); // Rimuove orario
                cellType = 'd'; // 'd' indica una data
                worksheet[cellAddress] = { v: normalizedDate, t: cellType, z: 'dd/mm/yyyy' };
                continue;
            }
        
            // Scrivi la cella
            worksheet[cellAddress] = { v: value, t: cellType };
        }
        // Aggiorna il range del foglio
        worksheet['!ref'] = xlsx.utils.encode_range(range.s, { r: nextRowNum, c: range.e.c });
    });

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
            // Aggiungi le righe dal CSV al foglio Excel
            results.forEach((row, index) => {
                const date = row['Data'] ? parseDate(row['Data']) : null;
                console.log(date);
                const newRow = [
                    null,
                    row['Netto'] || '',
                    row['Valuta'] || '',
                    date || '',
                    'PAYPAL',
                    row['Nome'] || '',
                    row['Descrizione'] || ''
                ];
                xlsx.utils.sheet_add_aoa(worksheet, [newRow], { origin: -1 }); // Aggiungi alla fine del foglio

                // Trova la prossima riga vuota nel foglio di destinazione
                const range = xlsx.utils.decode_range(worksheet['!ref']);
                const nextRowNum = range.e.r + 1; // Prossima riga disponibile
                //const cellStart = xlsx.utils.encode_cell({ r: nextRowNum, c: 0 });
                //const cellEnd = xlsx.utils.encode_cell({ r: nextRowNum, c: newRow.length - 1 });

                // Aggiungi i dati
                for (let col = 0; col < newRow.length; col++) {
                    const cellAddress = xlsx.utils.encode_cell({ r: nextRowNum, c: col });
                    const value = newRow[col] || '';

                    // Determina il tipo della cella
                    let cellType = 's'; // Default: stringa
                    if (col === 1 && value !== '') { // Colonna import_transaction
                        cellType = 'n'; // 'n' indica un numero
                    } else if (col === 3) { // Colonna data
                        // Converte il numero Excel in oggetto Date
                        const jsDate = excelDateToJSDate(value);
                        const normalizedDate = normalizeDate(jsDate); // Rimuove orario
                        cellType = 'd'; // 'd' indica una data
                        worksheet[cellAddress] = { v: normalizedDate, t: cellType, z: 'dd/mm/yyyy' };
                        continue;
                    }
                
                    // Scrivi la cella
                    worksheet[cellAddress] = { v: value, t: cellType };
                }
                // Aggiorna il range del foglio
                worksheet['!ref'] = xlsx.utils.encode_range(range.s, { r: nextRowNum, c: range.e.c });
            });


            // Scrivi il file Excel modificato in un file temporaneo
            //xlsx.writeFile(workbook, TEMP_FILE_PATH);

            // Rinomina il file temporaneo al nome finale
            //fs.renameSync(TEMP_FILE_PATH, FILE_PATH_TEMPLATE);

            xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
        })
        .on('error', (err) => {
            res.status(500).json({ error: 'Errore durante l’elaborazione del file', details: err.message });
        });
}

// Funzione per convertire una stringa 'dd/mm/yyyy' in un oggetto Date
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);  // I mesi in JavaScript sono indicizzati a zero
}


module.exports = router;

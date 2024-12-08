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
        const selectedService = req.body.service;

        if (selectedService == 'intesa') {
            // Controlla se un file è stato caricato
            if (!req.file) {
                return res.status(400).json({
                    type: 'error',
                    text: 'Nessun file csv/xls/xlsx caricato.'
                });
            }
            logger.info(`File caricato in memoria per lettura: ${req.file.originalname}`)
            const workbook2 = new Excel.Workbook();
            await workbook2.xlsx.load(req.file.buffer);
            const worksheet2 = workbook2.getWorksheet(1);

            let workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(FILE_PATH_TEMPLATE);
            const worksheet = workbook.getWorksheet(1);

            if (selectedService != 'intesa' && selectedService != 'paypal') {
                res.status(400).json({
                    type: 'error',
                    text: `Service non disponibile: ${selectedService}`
                })
            }

            // Mappare i dati e aggiungerli
            worksheet2.eachRow({ includeEmpty: false }, (row, rowNumber) => { //includeEmpty ignora le righe completamente vuote
                if (selectedService == "intesa") {
                    if (rowNumber > 19) {
                        const import_transaction = row.getCell(8).value || '';
                        const currency = row.getCell(7).value || '';
                        const date = row.getCell(1).value || '';
                        const counterparty = row.getCell(2).value || '';
                        const description = row.getCell(3).value || '';
                        const newRow = worksheet.addRow([
                            null,
                            import_transaction,
                            currency,
                            date,
                            'INTESA SANPAOLO',
                            counterparty,
                            description
                        ]);
                        newRow.commit();
                    }
                }
            });

            // Scrivi le modifiche
            await workbook.xlsx.writeFile(FILE_PATH_TEMPLATE);
            logger.info('File output aggiornato con successo!');

            res.json({
                type: 'success',
                text: `File elaborato con successo: ${req.file.originalname}`
            });


        } else if (selectedService == 'paypal') {
            const readableStream = Readable.from(req.file.buffer);
            const results = []; // Array to store the parsed data

            // Leggi il file Excel template
            const workbook = xlsx.readFile(FILE_PATH_TEMPLATE);
            let worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Ottieni il primo foglio

            // Verifica il numero di righe nel foglio
            //const rowCount = xlsx.utils.sheet_to_json(worksheet, { header: 1 }).length;

            // Funzione per rimuovere le righe vuote (puoi personalizzarla)
            //function cleanWorksheet(worksheet) {
            //    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
            //    const cleanRows = rows.filter(row => row.some(cell => cell !== null && cell !== ''));
            //    const newWorksheet = xlsx.utils.aoa_to_sheet(cleanRows); // Rebuild worksheet without empty rows
            //    return newWorksheet;
            //}

            //worksheet = cleanWorksheet(worksheet); // Pulisce il worksheet

            // Leggi e parse il CSV
            readableStream
                .pipe(csvParser())
                .on('data', (row) => {
                    const normalizedRow = normalizeKeys(row); // Assumendo che normalizeKeys sia definito
                    results.push(normalizedRow);
                })
                .on('end', () => {
                    // Aggiungi le righe dal CSV al foglio Excel
                    results.forEach((row, index) => {
                        const newRow = [
                            null,
                            row['Netto'] || '',
                            row['Valuta'] || '',
                            row['Data'] || '',
                            'PAYPAL',
                            row['Nome'] || '',
                            row['Descrizione'] || ''
                        ];
                        xlsx.utils.sheet_add_aoa(worksheet, [newRow], { origin: -1 }); // Aggiungi alla fine del foglio
                    });

                    // Scrivi il file Excel modificato in un file temporaneo
                    xlsx.writeFile(workbook, TEMP_FILE_PATH);

                    // Rinomina il file temporaneo al nome finale
                    fs.renameSync(TEMP_FILE_PATH, FILE_PATH_TEMPLATE);

                    logger.info('File output aggiornato con successo!');
                    res.json({
                        type: 'success',
                        text: `File elaborato con successo: ${req.file.originalname}`
                    });
                })
                .on('error', (err) => {
                    res.status(500).json({ error: 'Errore durante l’elaborazione del file', details: err.message });
                });
        }
        
    } catch (error) {
        console.error('Errore durante l’elaborazione:', error);
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

function cleanWorksheet(worksheet) {
    const usedRows = worksheet.actualRowCount;

    // Rimuovi righe inutilizzate alla fine
    worksheet.spliceRows(usedRows + 1, worksheet.rowCount - usedRows);

    // Trova righe vuote nel mezzo e rimuovile
    const rowsToRemove = [];
    worksheet.eachRow((row, rowNumber) => {
        if (row.values.every(value => value === null || value === '')) {
            rowsToRemove.push(rowNumber);
        }
    });

    // Rimuovi le righe vuote in ordine inverso per evitare problemi di indicizzazione
    rowsToRemove.reverse().forEach(rowNumber => {
        worksheet.spliceRows(rowNumber, 1);
    });
}



function removeEmptyRows(worksheet) {
    const lastUsedRow = worksheet.actualRowCount; // Conta le righe effettivamente utilizzate
    const totalRows = worksheet.rowCount; // Conta tutte le righe, incluse le vuote o corrotte

    if (totalRows > lastUsedRow) {
        worksheet.spliceRows(lastUsedRow + 1, totalRows - lastUsedRow); // Rimuove le righe extra
    }
}


function resetWorksheet(worksheet) {
    const newWorkbook = new Excel.Workbook();
    const newWorksheet = newWorkbook.addWorksheet(workbook.getWorksheet(1).name);
    worksheet.eachRow((row, rowNumber) => {
        newWorksheet.addRow(row.values);
    });

    return newWorkbook;
}



function updateRowCount(worksheet) {
    const maxRow = worksheet.rowCount;
    let actualRowCount = 0;
    
    for (let i = 1; i <= maxRow; i++) {
        if (worksheet.getRow(i).hasValues()) {
            actualRowCount++;
        }
    }
    
    // Riassegna il valore effettivo delle righe
    worksheet.rowCount = actualRowCount;
}



module.exports = router;

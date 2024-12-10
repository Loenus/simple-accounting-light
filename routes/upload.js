const express = require('express');
const logger = require('../config/logger');
const upload = require('../config/multerConfig');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const xlsx = require('xlsx');
const copyTasks = require('../jobs/copyTransactions');
const importCash = require('../jobs/importCashTransactions');
const utils = require('../utils/excelUtils')

let isUploadInProgress = false; // Variabile per indicare se un upload è in corso
const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const TEMP_FILE_PATH = process.env.TEMP_FILE_PATH;

const router = express.Router();


router.get('/import-cash', async (req, res) => {
    if (isUploadInProgress) {
        return res.status(429).json({
            type: 'error',
            text: 'Un altro upload è già in corso. Riprova più tardi.',
        });
    }
    isUploadInProgress = true; // Blocca nuove richieste

    try {
        await importCash.performDailyTask();
        return res.status(200).json({
            type: 'success',
            text: 'Excel di output aggiornato con Successo!',
        });
    } catch (error) {
        return res.status(500).json({
            type: 'error',
            text: 'ERRORE durante l\'aggiornamento del file Excel di output',
        });
    } finally {
        isUploadInProgress = false; // Consenti nuove richieste
    }
})


router.get('/refresh', async (req, res) => {
    if (isUploadInProgress) {
        return res.status(429).json({
            type: 'error',
            text: 'Un altro upload è già in corso. Riprova più tardi.',
        });
    }
    isUploadInProgress = true; // Blocca nuove richieste

    try {
        await copyTasks.copiaRigheConFormato(FILE_PATH_TEMPLATE, TEMP_FILE_PATH);
        return res.status(200).json({
            type: 'success',
            text: 'Excel di output aggiornato con Successo!',
        });
    } catch (error) {
        return res.status(500).json({
            type: 'error',
            text: 'ERRORE durante l\'aggiornamento del file Excel di output',
        });
    } finally {
        isUploadInProgress = false; // Consenti nuove richieste
    }
})


// TODO: impedire il caricamento di un file paypal come un file intesa e viceversa
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

        utils.writeNewRowOnTemplate(worksheet, newRow);
    });

    utils.updateTemplate(worksheet);

    // Salva il file di output
    xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
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
                const date = row['Data'] ? utils.parseDate(row['Data']) : null;
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

                utils.writeNewRowOnTemplate(worksheet, newRow);
            });

            utils.updateTemplate(worksheet);

            // Salva il file aggiornato
            xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
        })
        .on('error', (err) => {
            res.status(500).json({ error: 'Errore durante l’elaborazione del file', details: err.message });
        });
}

// necessario perhé nel csv di paypal alcune chiavi hanno doppi apici e altre singoli
const normalizeKeys = (row) => {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
            key.trim().replace(/"/g, ''), // Rimuove spazi e doppi apici
            value
        ])
    );
};


module.exports = router;

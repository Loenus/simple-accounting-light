const express = require('express');
const logger = require('../config/logger');
const upload = require('../config/multerConfig'); // Configurazione di Multer
const Excel = require('exceljs');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

let isUploadInProgress = false; // Variabile per indicare se un upload è in corso
const workbook = new Excel.Workbook();
const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;

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
                            import_transaction, // colonna A del file statico
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

            // Read and parse the CSV file
            readableStream
                .pipe(csvParser())
                .on('data', (row) => {
                    results.push(row);
                    results.forEach((row, index) => {
                        console.log(`Row ${index}:`, row);
                    });
                    
                })
                .on('end', () => {
                    throw new Error('TEMP per non eliminare il file nella richiesta');
                    res.json({ message: 'File processato con successo', data: results });
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

module.exports = router;

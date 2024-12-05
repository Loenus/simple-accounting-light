const express = require('express');
const logger = require('../config/logger');
const upload = require('../config/multerConfig'); // Configurazione di Multer
const Excel = require('exceljs');

let isUploadInProgress = false; // Variabile per indicare se un upload è in corso
const workbook = new Excel.Workbook();
const FILEPATHTEMPLATE = process.env.FILEPATHTEMPLATE;

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

        await workbook.xlsx.readFile(FILEPATHTEMPLATE);
        const worksheet = workbook.getWorksheet(1);

        // Mappare i dati e aggiungerli
        worksheet2.eachRow({ includeEmpty: false }, (row, rowNumber) => { //includeEmpty ignora le righe completamente vuote
            if (selectedService == "intesa") {
                if (rowNumber > 19) {
                    const cell1 = row.getCell(1).value || 'Valore predefinito per A';
                    const cell3 = row.getCell(8).value || null;
                    const newRow = worksheet.addRow([
                        cell1, // colonna A del file statico
                        'A', // colonna B
                        'ss','ss',
                        cell3
                    ]);
                    newRow.commit();
                }
            } else if (selectedService == "paypal") {
                console.log('TODO elaborazione paypal')
            }
        });

        // Scrivi le modifiche
        await workbook.xlsx.writeFile(FILEPATHTEMPLATE);
        logger.info('File output aggiornato con successo!');

        res.json({
            type: 'success',
            text: `File elaborato con successo: ${req.file.originalname}`
        });
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

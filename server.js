const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Excel = require('exceljs');
const workbook = new Excel.Workbook();

require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

let isUploadInProgress = false; // Variabile per indicare se un upload è in corso
const filePathTemplate = 'Template2.xlsx';


// Configurazione per memorizzare i file in memoria
const storage = multer.memoryStorage();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // Limite: 50 MB
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            //'text/csv',
            'application/vnd.ms-excel', // .xls
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true); // Accetta il file
        } else {
            //cb (null, false)
            // Usa next per passare l'errore al middleware di gestione errori
            const error = new Error('Formato file non supportato. Carica solo CSV, XLS o XLSX.');
            error.status = 400; // Puoi anche impostare un codice di stato personalizzato
            cb(error); // Passa l'errore al middleware di gestione degli errori
        }
    }
});


app.get('/', (req, res) => {
    res.render('index', { message: null });
});

app.post('/upload', upload.single('file'), async (req, res) => {
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
        console.log(`File caricato in memoria: ${req.file.originalname}`)
        const workbook2 = new Excel.Workbook();
        await workbook2.xlsx.load(req.file.buffer);
        const worksheet2 = workbook2.getWorksheet(1);

        await workbook.xlsx.readFile(filePathTemplate);
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
        await workbook.xlsx.writeFile(filePathTemplate);
        console.log('File output aggiornato con successo!');

        res.json({
            type: 'success',
            text: `File elaborato con successo: ${req.file.filename}`
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


// deve essere definito dopo multer
// gestisce solo gli errori generati con "next(error)" o "cb(new Error(...))"
app.use((err, req, res, next) => {
    if (err.message === 'Formato file non supportato. Carica solo CSV, XLS o XLSX.') {
        return res.status(400).json({
            type: 'error',
            text: err.message,
        });
    }
    next(err); // Passa altri errori al gestore successivo
});

// deve essere definito alla fine
app.use((err, req, res, next) => {
    if (err.message && ~err.message.indexOf('Formato file non supportato')) {
        return res.status(400).json({
            type: 'error',
            text: err.message,
        });
    }
   
    // error as json
    return res.status(err.status || 500)
        .json({error: err.message});
});
   
// assume 404 since no middleware responded
app.use((req, res, next) => {
      res.status(404)
       .json({
       url: req.originalUrl,
       error: 'Not found',
     });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
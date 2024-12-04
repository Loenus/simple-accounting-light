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

// Configurazione per memorizzare i file in memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.render('index', { message: null });
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const selectedService = req.body.service;

        // Controlla se un file è stato caricato
        if (!req.file) {
            return res.status(400).json({
                type: 'error',
                text: 'Nessun file caricato.'
            });
        }
        console.log(`File caricato in memoria: ${req.file.originalname}`)
        const workbook2 = new Excel.Workbook();
        await workbook2.xlsx.load(req.file.buffer);
        const worksheet2 = workbook2.getWorksheet(1);

        await workbook.xlsx.readFile('Template2.xlsx');
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
        await workbook.xlsx.writeFile('Template2.xlsx');
        console.log('File test.xlsx aggiornato con successo!');

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
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
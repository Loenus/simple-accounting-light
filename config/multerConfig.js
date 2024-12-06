const multer = require('multer');

// Configurazione di Multer per memorizzare i file in memoria
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Limite: 50 MB
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'text/csv',
            'application/vnd.ms-excel', // .xls
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true); // Accetta il file
        }  else {
            //cb (null, false)
            // Usa next per passare l'errore al middleware di gestione errori
            const error = new Error('Formato file non supportato. Carica solo CSV, XLS o XLSX.');
            error.status = 400; // Puoi anche impostare un codice di stato personalizzato
            cb(error); // Passa l'errore al middleware di gestione degli errori
        }
    }
});

module.exports = upload;

const logger = require('../config/logger'); // Usa il logger configurato

// Gestione errori per file non supportati
const unsupportedFileHandler = (err, req, res, next) => {
    if (err.message && ~err.message.indexOf('Formato file non supportato')) {
        return res.status(400).json({
            type: 'error',
            text: err.message,
        });
    }
    next(err); // Passa altri errori al gestore successivo
};

// Gestione errori generici
const genericErrorHandler = (err, req, res, next) => {
    logger.error(`Errore: ${err.message}`); // Log dell'errore
    res.status(err.status || 500).json({
        error: err.message,
    });
};

// Gestione errori 404
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        url: req.originalUrl,
        error: 'Not found',
    });
};

// Esporta i middleware degli errori
module.exports = {
    unsupportedFileHandler,
    genericErrorHandler,
    notFoundHandler,
};

const logger = require('../config/logger'); // Importa il logger configurato

// Middleware di logging delle richieste
const requestLogger = (req, res, next) => {
    const { method, url } = req;
    const startTime = Date.now();

    logger.info(`Richiesta ricevuta: ${method} ${url}`);

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info(`Richiesta completata: ${method} ${url} - Stato: ${res.statusCode} - Tempo: ${duration}ms`);
    });

    next();
};

module.exports = requestLogger;

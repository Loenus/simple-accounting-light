const express = require('express');
const path = require('path');

require("dotenv").config();
const logger = require('./config/logger');
const requestLogger = require('./middleware/logging');
const indexRouter = require('./routes/index');
const uploadRouter = require('./routes/upload');
const task = require('./jobs/dailyTask');
const errorHandlers = require('./middleware/errorHandlers');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware di logging (deve stare all'inizio)
app.use(requestLogger);

//dailyTask();
//task.performDailyTask();
app.use('/', indexRouter);
app.use('/api', uploadRouter);

// ERROR HANDLING DEFINITI ALLA FINE
// Express processa i middleware e le route in ordine sequenziale.
// Se un middleware o una route chiama next(err) o solleva un errore, l'errore viene inviato al primo middleware di error handling trovato dopo il punto in cui è stato generato l'errore.
// deve essere definito dopo multer
// gestisce solo gli errori generati con "next(error)" o "cb(new Error(...))"
app.use(errorHandlers.unsupportedFileHandler); // Gestione errori specifici
app.use(errorHandlers.genericErrorHandler); // Gestione errori generici
app.use(errorHandlers.notFoundHandler); // Gestione errori 404

app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});
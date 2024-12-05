const cron = require('node-cron');
const logger = require('../config/logger');
const Excel = require('exceljs');

const workbook = new Excel.Workbook();
const FILEPATHTEMPLATE = process.env.FILEPATHTEMPLATE;

function performDailyTask() {
    // recuperare da un file di testo le transazioni cash con una regex
    // metterle nel file di template
    // eliminare le transazioni recuperate dal file testo

    logger.info('Task giornaliero completato.');
}

// Configurazione del cronjob
const dailyTask = () => {
    cron.schedule('0 2 * * *', () => {
        logger.info('Inizio task giornaliero alle 2:00 AM');
        performDailyTask();
    });
};

module.exports = dailyTask;

const cron = require('node-cron');
const logger = require('../config/logger');
const fs = require('fs');
const xlsx = require('xlsx');
const utils = require('../utils/excelUtils')

const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const INPUT_FILE_PATH = process.env.INPUT_FILE_PATH;


async function performDailyTask() {
    // recuperare da un file di testo le transazioni cash con una regex
    // metterle nel file di template
    // eliminare le transazioni recuperate dal file testo

    // Leggere il file di testo
    const fileData = fs.readFileSync(INPUT_FILE_PATH, 'utf8');
    //const lines = fileData.split('\n'); // Divide il contenuto in righe
    //const dataWithoutFirstLine = lines.slice(1).join('\n'); // Unisce di nuovo senza la prima riga


    // Regex per trovare tutte le transazioni nel formato "Beneficiario:Soldi,"
    //const regex = /([^:]+):([^,]+),/g; //non funzionava in tutti i casi
    //const regex = /(\b[^:,]+):(\d+),?/g;
    //const regex2 = /(\b[^(:]+)(?:\s*\(([^)]+)\))?\s*:\s*(\d+),?/g;
    const regex2 = /(\b[^(:]+)(?:\s*\(([^)]+)\))?\s*:\s*(\d+)\s*,?/g;
    const transactions = [];
    let match;

    /*while ((match = regex.exec(fileData)) !== null) {
        const [_, beneficiario, soldi] = match;
        transactions.push({ Beneficiario: beneficiario.trim(), Soldi: parseFloat(soldi.trim()) });
    }*/
    while ((match = regex2.exec(fileData)) !== null) {
        const [_, beneficiario, luogo, soldi] = match; // Destrutturazione
        transactions.push({
            Beneficiario: beneficiario.trim(),
            Luogo: luogo ? luogo.trim() : null, // Se luogo è undefined, assegna null
            Soldi: parseInt(soldi, 10),
        });
    }
    logger.info(`Trovate ${transactions.length} transazioni cash da inserire!`)
    console.log(transactions)

    // Scrivere le transazioni nel file Excel
    //await workbook.xlsx.readFile(FILE_PATH_TEMPLATE); // Carica il file template
    //const worksheet = workbook.getWorksheet(1); // Assume che stia usando il primo foglio
    const workbook = xlsx.readFile(FILE_PATH_TEMPLATE);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    transactions.forEach((transaction) => {
        const dateInput = new Date().toLocaleDateString('it-IT');
        const date = utils.parseDate(dateInput.toString());
        const row = [
            null,
            -transaction.Soldi,
            'EUR',
            date,
            'CASH',
            transaction.Beneficiario,              
            ''
        ];
        try {
            utils.writeNewRowOnTemplate(worksheet, row);
        } catch (error) {
            console.log(error)
        }
    });

    utils.updateTemplate(worksheet);

    xlsx.writeFile(workbook, FILE_PATH_TEMPLATE);
    logger.info("completato salvataggio delle transazioni cash")

    // Rimuovere le transazioni elaborate dal file originale
    //const updatedFileData = fileData.replace(regex2, '').trim();
    //fs.writeFileSync(INPUT_FILE_PATH, updatedFileData, 'utf8');
}


// Configurazione del cronjob
const dailyTask = () => {
    cron.schedule('0 1 * * *', async () => {
        logger.info('Inizio task giornaliero alle 2:00 AM');
        try {
            await performDailyTask();
            logger.info('Task giornaliero completato con successo.');
        } catch (error) {
            logger.error(`Errore durante il task giornaliero: ${error.message}`);
        }
    });
};


module.exports = { dailyTask, performDailyTask };

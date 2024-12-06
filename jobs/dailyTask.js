const cron = require('node-cron');
const logger = require('../config/logger');
const Excel = require('exceljs');
const fs = require('fs');

const workbook = new Excel.Workbook();
const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const INPUT_FILE_PATH = process.env.INPUT_FILE_PATH;

async function performDailyTask() {
    // recuperare da un file di testo le transazioni cash con una regex
    // metterle nel file di template
    // eliminare le transazioni recuperate dal file testo

    try {
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
        console.log(transactions.length)
        console.log(transactions)

        // Scrivere le transazioni nel file Excel
        await workbook.xlsx.readFile(FILE_PATH_TEMPLATE); // Carica il file template
        const worksheet = workbook.getWorksheet(1); // Assume che stia usando il primo foglio

        transactions.forEach((transaction) => {
            const row = worksheet.addRow([
                new Date().toLocaleDateString('it-IT'),
                transaction.Beneficiario,              
                'ss',                                  
                'ss',                                  
                -transaction.Soldi
            ]);
            
            // Formatta la cella del prezzo
            row.getCell(5).numFmt = '#,##0.00 €';
            row.commit();
        });

        await workbook.xlsx.writeFile(FILE_PATH_TEMPLATE); // Salva il file Excel aggiornato

        // Rimuovere le transazioni elaborate dal file originale
        //const updatedFileData = fileData.replace(regex2, '').trim();
        //fs.writeFileSync(INPUT_FILE_PATH, updatedFileData, 'utf8');

        logger.info('Task giornaliero completato con successo.');
    } catch (error) {
        logger.error(`Errore durante l'esecuzione del task giornaliero: ${error.message}`);
    }
}

// Configurazione del cronjob
const dailyTask = () => {
    cron.schedule('0 2 * * *', async () => {
        logger.info('Inizio task giornaliero alle 2:00 AM');
        try {
            await performDailyTask();
        } catch (error) {
            logger.error(`Errore durante il task giornaliero: ${error.message}`);
        }
    });
};

module.exports = {dailyTask, performDailyTask};

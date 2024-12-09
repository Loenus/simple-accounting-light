const cron = require('node-cron');
const logger = require('../config/logger');
const ExcelJS = require('exceljs');

const FILE_PATH_TEMPLATE = process.env.FILE_PATH_TEMPLATE;
const TEMP_FILE_PATH = process.env.TEMP_FILE_PATH;


async function copiaRigheConFormato(inputFile, outputFile) {
  // Carica il file sorgente
  const workbookSorgente = new ExcelJS.Workbook();
  await workbookSorgente.xlsx.readFile(inputFile);

  // Carica il file di destinazione
  const workbookDestinazione = new ExcelJS.Workbook();
  await workbookDestinazione.xlsx.readFile(outputFile);

  // Itera sui fogli del file sorgente
  workbookSorgente.eachSheet((sheetSorgente) => {
      // Trova il foglio corrispondente nel file di destinazione
      const sheetDestinazione = workbookDestinazione.getWorksheet(sheetSorgente.name);

      if (sheetDestinazione) {
          // Trova il numero massimo di righe nel file sorgente
          let lastSourceRow = 1; // Variabile per tenere traccia dell'ultima riga valida
          sheetSorgente.eachRow({ includeEmpty: true }, (row, rowIndex) => {
              if (rowIndex >= 2) { // Ignora la riga 1
                  // Copia i valori della riga
                  const values = row.values;

                  // Trova la riga corrispondente nel foglio di destinazione
                  const destinazioneRow = sheetDestinazione.getRow(rowIndex);

                  // Scrive i valori copiati mantenendo la formattazione del file destinazione
                  values.forEach((value, colIndex) => {
                      if (colIndex > 0) { // ExcelJS utilizza un array 1-based
                          destinazioneRow.getCell(colIndex).value = value;
                      }
                  });

                  // Commit della riga
                  destinazioneRow.commit();
                  lastSourceRow = rowIndex; // Aggiorna l'ultima riga valida
              }
          });

          // Elimina le righe in eccesso nel foglio di destinazione
          const lastDestRow = sheetDestinazione.rowCount;

          // Rimuovi righe extra rispetto alla sorgente
          for (let i = lastDestRow; i > lastSourceRow; i--) {
              sheetDestinazione.getRow(i).values = [];
              sheetDestinazione.getRow(i).commit();
          }

          logger.info(
              `Foglio "${sheetDestinazione.name}": Copiate ${lastSourceRow - 1} righe, rimosse ${lastDestRow - lastSourceRow} righe extra.`
          );
      } else {
          console.warn(`Foglio "${sheetSorgente.name}" non trovato nel file di destinazione.`);
      }
  });

  // Salva il file di destinazione aggiornato
  await workbookDestinazione.xlsx.writeFile(outputFile);

  logger.info(`Le righe sono state copiate da "${inputFile}" a "${outputFile}".`);
}




// Configurazione del cronjob
const copyTask = () => {
    cron.schedule('0 2 * * *', async () => {
        logger.info('Inizio task giornaliero alle 2:00 AM');
        try {
            await copiaRigheConFormato(FILE_PATH_TEMPLATE, TEMP_FILE_PATH); //source,dest
            logger.info('Task giornaliero completato.');
        } catch (error) {
            logger.error(`Errore durante il task giornaliero: ${error.message}`);
        }
    });
};


module.exports = { copyTask, copiaRigheConFormato };

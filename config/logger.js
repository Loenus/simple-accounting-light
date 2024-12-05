const winston = require('winston');
require('winston-daily-rotate-file');

// Configurazione dei trasporti del logger
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
  new winston.transports.DailyRotateFile({
    filename: 'logs/%DATE%-app.log',
    datePattern: 'YYYY-MM', // un mese -> un log file
    maxSize: '10m', // 10mb
    maxFiles: '12', // Mantieni fino a 12 file
    level: 'info',
  }),
];

// Creazione dell'istanza del logger
const logger = winston.createLogger({
  level: 'info', // Livello minimo dei log
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports,
});

// Esporta il logger per usarlo altrove
module.exports = logger;

Progetto self hosted

Per avviare il progetto su una macchina, è necessario installare node e npm.
Inoltre, per la gestione dei processi si consiglia di installare <strong>pm2</strong>

```npm install pm2 -g```

tramite questo process manager, gestire il progetto in questo modo:
- avvia il progetto in questo modo:
```pm2 start server.js --name "my-node-app"```
- monitora: 
    - processi attivi ```pm2 list```
    - log dell'app ```pm2 logs my-node-app```
    - riavvia l'app ```pm2 restart my-node-app```
    - arresta l'app ```pm2 stop my-node-app```
    - rimuovi l'app da PM2 ```pm2 delete my-node-app```

per configurare il riavvio automatico dell'app al riavvio del sistema:
```pm2 startup``` e ```pm2 save```

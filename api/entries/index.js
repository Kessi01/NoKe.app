const { container } = require('../db');

module.exports = async function (context, req) {
    // FIX 1: Sicherheitscheck gegen Fehler 500
    if (!container) {
        context.log.error("DB Verbindung fehlt in entries/index.js");
        context.res = {
            status: 500,
            body: { success: false, message: "Datenbankverbindung fehlgeschlagen." }
        };
        return;
    }

    const method = req.method.toLowerCase();

    if (method === 'post') {
        const entry = req.body;
        if (!entry.id) entry.id = Math.random().toString(36).substring(2, 15);

        entry.type = 'entry';

        // FIX 2: Partition Key (username) muss der Owner sein.
        // Das Frontend sendet "user" als Owner und "username" als Login-Username.
        // Wir speichern den Login-Username als "loginUsername" IMMER bevor wir username überschreiben.
        
        // Speichere Login-Username (das was der User im Formular eingibt)
        // Prüfe ob username existiert UND nicht bereits der Owner ist
        if (entry.username && entry.user && entry.username !== entry.user) {
            entry.loginUsername = entry.username;  // Login-Username des Eintrags
        } else if (entry.username && !entry.user) {
            // Fallback: wenn nur username gesendet wird, ist es der loginUsername
            entry.loginUsername = entry.username;
        }
        
        // Setze Owner als Partition Key
        if (entry.user) {
            entry.username = entry.user;  // Owner (Partition Key)
            delete entry.user; // Cleanup
        }

        // ENCRYPTION
        if (entry.password) {
            const { encrypt } = require('../shared/crypto');
            entry.password = encrypt(entry.password);
        }

        try {
            await container.items.upsert(entry);
            context.res = { body: { success: true } };
        } catch (e) {
            context.log.error(e);
            context.res = { status: 500, body: { success: false, message: e.message } };
        }
    }

    if (method === 'delete') {
        const { id, username } = req.body;
        try {
            // Partition Key (username) ist zwingend erforderlich bei Cosmos DB Delete
            await container.item(id, username).delete();
            context.res = { body: { success: true } };
        } catch (e) {
            context.log.error(e);
            // Fehler abfangen statt Server Crash
            context.res = { status: e.code || 500, body: { success: false, message: e.message } };
        }
    }
};

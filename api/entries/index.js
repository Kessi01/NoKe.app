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
        // FIX 2: Konsistente Benennung sicherstellen.
        // Wenn dein Frontend "user" sendet, mapping auf "username" für die DB
        entry.username = entry.user || entry.username; 

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
        } catch(e) {
            context.log.error(e);
            // Fehler abfangen statt Server Crash
            context.res = { status: e.code || 500, body: { success: false, message: e.message } };
        }
    }
};

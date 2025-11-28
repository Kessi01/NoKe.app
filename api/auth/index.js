const { container } = require('../db'); // .js ist optional
const bcrypt = require('bcryptjs');

module.exports = async function (context, req) {
    context.log("🚀 Function 'RegisterLogin' wurde gestartet.");

    try {
        // --- CHECK 1: Ist der Request-Body überhaupt da? ---
        // (Häufiger Fehler: Client sendet kein JSON oder falschen Content-Type)
        if (!req.body) {
            throw new Error("Der Request Body ist leer (undefined). Bitte sende 'Content-Type: application/json'.");
        }

        const { action, username, password } = req.body;

        // --- CHECK 2: Sind die Datenbank-Objekte geladen? ---
        // Wir prüfen das HIER, damit der Fehler im catch landet.
        if (!container) {
            // Wir loggen einmalig die Umgebungsvariable (ohne den ganzen Key zu zeigen), um zu sehen, ob sie existiert
            const connStringDebug = process.env.COSMOS_CONNECTION_STRING ? "Vorhanden (Länge: " + process.env.COSMOS_CONNECTION_STRING.length + ")" : "NICHT GESETZT";
            throw new Error(`Datenbank-Container konnte nicht geladen werden. ConnectionString Status: ${connStringDebug}`);
        }

        // --- CHECK 3: Validierung der Eingaben ---
        if (!action || !username || !password) {
            context.res = {
                status: 400,
                body: { success: false, message: "Fehlende Daten: action, username und password sind Pflichtfelder." }
            };
            return;
        }

        // --- DB ABFRAGE ---
        context.log(`🔍 Suche nach User: ${username} für Action: ${action}`);
        
        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };

        // Hier kann es knallen, wenn die Firewall blockt oder der Key falsch ist
        const { resources } = await container.items.query(querySpec).fetchAll();
        
        context.log(`✅ DB Abfrage erfolgreich. Gefundene User: ${resources.length}`);

        // --- LOGIK: REGISTER ---
        if (action === 'register') {
            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            await container.items.create({ 
                id: username + "_profile", 
                username, 
                password: hashedPassword, 
                type: "user",
                createdAt: new Date().toISOString()
            });

            context.res = { body: { success: true, message: "User angelegt" } };

        // --- LOGIK: LOGIN ---
        } else if (action === 'login') {
            if (resources.length === 0) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }
            
            const valid = await bcrypt.compare(password, resources[0].password);
            
            if (!valid) {
                context.res = { body: { success: false, message: "Falsches Passwort" } };
                return;
            }
            
            context.res = { body: { success: true, username } };

        } else {
            context.res = { status: 400, body: { success: false, message: "Ungültige Action" } };
        }

    } catch (error) {
        // --- FEHLERANALYSE ---
        // Das hier taucht in den Azure Logs (Monitor) auf
        context.log.error("❌ CRITICAL ERROR in RegisterLogin:");
        context.log.error("Message: ", error.message);
        context.log.error("Stack Trace: ", error.stack); // Zeigt die genaue Zeile im Code an!

        context.res = { 
            status: 500, 
            body: { 
                success: false, 
                message: "Interner Serverfehler (siehe Logs)",
                // DEBUG-INFO: Das hier gibt dir den Fehler direkt in Postman/Frontend zurück.
                // ACHTUNG: Sobald es läuft, nimm 'errorDetails' wieder raus!
                errorDetails: error.message 
            } 
        };
    }
};
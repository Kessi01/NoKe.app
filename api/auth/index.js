// Crypto MUSS vor bcryptjs geladen werden und global verfügbar gemacht werden
const crypto = require('crypto');
global.crypto = crypto; // Macht crypto global verfügbar für bcryptjs

const { container } = require('../db'); // .js ist optional
const bcrypt = require('bcryptjs');

module.exports = async function (context, req) {
    context.log("🚀 Function 'RegisterLogin' wurde gestartet.");
    context.log("📥 Request Method:", req.method);
    context.log("📥 Request Headers:", JSON.stringify(req.headers));
    context.log("📥 Request Body Type:", typeof req.body);
    context.log("📥 Request Body:", JSON.stringify(req.body));

    try {
        // --- CHECK 1: Ist der Request-Body überhaupt da? ---
        // (Häufiger Fehler: Client sendet kein JSON oder falschen Content-Type)
        if (!req.body) {
            context.log.error("❌ Request Body ist undefined oder null");
            throw new Error("Der Request Body ist leer (undefined). Bitte sende 'Content-Type: application/json'.");
        }

        const { action, username, password } = req.body;
        context.log("✅ Extrahierte Daten - Action:", action, "Username:", username, "Password Length:", password ? password.length : 0);

        // --- CHECK 2: Sind die Datenbank-Objekte geladen? ---
        // Wir prüfen das HIER, damit der Fehler im catch landet.
        context.log("🔍 Container Status:", container ? "Verfügbar" : "NULL/UNDEFINED");
        if (!container) {
            // Wir loggen einmalig die Umgebungsvariable (ohne den ganzen Key zu zeigen), um zu sehen, ob sie existiert
            const connStringDebug = process.env.COSMOS_CONNECTION_STRING ? "Vorhanden (Länge: " + process.env.COSMOS_CONNECTION_STRING.length + ")" : "NICHT GESETZT";
            context.log.error("❌ Container ist nicht verfügbar!");
            throw new Error(`Datenbank-Container konnte nicht geladen werden. ConnectionString Status: ${connStringDebug}`);
        }

        // --- CHECK 3: Validierung der Eingaben ---
        if (!action || !username || !password) {
            context.log.error("❌ Validierung fehlgeschlagen - Fehlende Felder:", { action: !!action, username: !!username, password: !!password });
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
            context.log("📝 REGISTER - User existiert bereits?", resources.length > 0);
            if (resources.length > 0) {
                context.log("⚠️ Benutzername bereits vergeben:", username);
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }
            
            context.log("🔐 Hashe Passwort...");
            const hashedPassword = await bcrypt.hash(password, 10);
            context.log("✅ Passwort gehasht. Länge:", hashedPassword.length);
            
            const newUserDoc = { 
                id: username + "_profile", 
                username, 
                password: hashedPassword, 
                type: "user",
                createdAt: new Date().toISOString()
            };
            context.log("💾 Erstelle User-Dokument:", JSON.stringify({ ...newUserDoc, password: "[HIDDEN]" }));
            
            await container.items.create(newUserDoc);
            context.log("✅ User erfolgreich in DB erstellt:", username);

            context.res = { body: { success: true, message: "User angelegt" } };

        // --- LOGIK: LOGIN ---
        } else if (action === 'login') {
            context.log("🔑 LOGIN - User gefunden?", resources.length > 0);
            if (resources.length === 0) {
                context.log("⚠️ Benutzer nicht gefunden:", username);
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }
            
            context.log("🔐 Vergleiche Passwort...");
            const valid = await bcrypt.compare(password, resources[0].password);
            context.log("✅ Passwort-Vergleich Ergebnis:", valid);
            
            if (!valid) {
                context.log("⚠️ Falsches Passwort für User:", username);
                context.res = { body: { success: false, message: "Falsches Passwort" } };
                return;
            }
            
            context.log("✅ Login erfolgreich:", username);
            context.res = { body: { success: true, username } };

        } else {
            context.log.error("❌ Ungültige Action:", action);
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
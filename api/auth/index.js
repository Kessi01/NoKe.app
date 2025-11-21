const { container } = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async function (context, req) {
    // Wir extrahieren die Daten aus dem Request Body
    const { action, username, password } = req.body;

    // Sicherheitscheck: Ist die DB-Verbindung da?
    if (!container) {
        context.res = { 
            status: 500, 
            body: { 
                success: false, 
                message: "Datenbank-Verbindung fehlt (Container ist null)" 
            } 
        };
        return;
    }

    try {
        // Query vorbereiten: Suche User mit diesem Namen
        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };
        
        // Datenbank abfragen
        const { resources } = await container.items.query(querySpec).fetchAll();

        // Logik für REGISTRIERUNG
        if (action === 'register') {
            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }
            // Passwort hashen
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // User in DB speichern
            await container.items.create({ 
                id: username + "_profile", 
                username, 
                password: hashedPassword, 
                type: "user" 
            });
            
            context.res = { body: { success: true } };

        // Logik für LOGIN
        } else if (action === 'login') {
            if (resources.length === 0) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }
            
            // Passwort prüfen
            const valid = await bcrypt.compare(password, resources[0].password);
            if (!valid) {
                context.res = { body: { success: false, message: "Falsches Passwort" } };
                return;
            }
            
            context.res = { body: { success: true, username } };
        }

    } catch (error) {
        // HIER WURDE GEÄNDERT:
        // Wir loggen den Fehler detailliert in die Azure Konsole
        context.log("Auth Error Details:", error);
        
        // Wir senden den echten Fehlertext zurück an das Frontend
        context.res = { 
            status: 500, 
            body: { 
                success: false, 
                message: error.message || "Unbekannter Server-Fehler", // Hier steht jetzt der echte Grund
                details: JSON.stringify(error) // Technische Details für Debugging
            } 
        };
    }
};

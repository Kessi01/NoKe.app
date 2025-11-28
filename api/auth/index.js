const { container } = require('../db.js');
const bcrypt = require('bcryptjs');

module.exports = async function (context, req) {
    // 1. Sicherheitscheck: Datenbankverbindung prüfen
    if (!container) {
        context.log.error("CRITICAL: Datenbank-Container ist null. Prüfe db.js und Connection String.");
        context.res = {
            status: 500,
            body: {
                success: false,
                message: "Server-Konfigurationsfehler: Keine Datenbankverbindung."
            }
        };
        return;
    }

    // 2. Daten aus dem Request holen
    const { action, username, password } = req.body || {};

    // Validierung: Sind alle nötigen Daten da?
    if (!action || !username || !password) {
        context.res = {
            status: 400,
            body: {
                success: false,
                message: "Fehlende Daten: action, username und password sind erforderlich."
            }
        };
        return;
    }

    try {
        // 3. Existiert der Benutzer bereits?
        // Wir suchen nach einem User-Dokument mit diesem Benutzernamen
        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        const existingUser = resources.length > 0 ? resources[0] : null;

        // ---------------------------------------------------------
        // A) REGISTRIERUNG
        // ---------------------------------------------------------
        if (action === 'register') {
            if (existingUser) {
                context.res = {
                    status: 409, // Conflict
                    body: { success: false, message: "Benutzername ist bereits vergeben." }
                };
                return;
            }

            // Passwort sicher hashen (Salt-Runden: 10)
            const hashedPassword = await bcrypt.hash(password, 10);

            // Neuen User in der DB anlegen
            // ID muss unique sein, daher hängen wir _profile an oder nutzen eine UUID
            await container.items.create({
                id: username + "_profile", // Eindeutige ID für Cosmos DB
                username: username,
                password: hashedPassword,
                type: "user",
                createdAt: new Date().toISOString()
            });

            context.res = {
                status: 201, // Created
                body: { success: true, message: "Benutzer erfolgreich erstellt." }
            };

        // ---------------------------------------------------------
        // B) LOGIN
        // ---------------------------------------------------------
        } else if (action === 'login') {
            if (!existingUser) {
                // Generische Fehlermeldung aus Sicherheitsgründen (User Enumeration verhindern)
                context.res = {
                    status: 401, // Unauthorized
                    body: { success: false, message: "Benutzername oder Passwort falsch." }
                };
                return;
            }

            // Passwort überprüfen
            const isPasswordValid = await bcrypt.compare(password, existingUser.password);

            if (!isPasswordValid) {
                context.res = {
                    status: 401,
                    body: { success: false, message: "Benutzername oder Passwort falsch." }
                };
                return;
            }

            // Login erfolgreich
            context.res = {
                status: 200,
                body: {
                    success: true,
                    message: "Login erfolgreich.",
                    username: existingUser.username
                }
            };

        } else {
            // Unbekannte Action
            context.res = {
                status: 400,
                body: { success: false, message: `Unbekannte Aktion: ${action}` }
            };
        }

    } catch (error) {
        // 4. Globales Error Handling
        context.log.error("Auth API Error:", error);
        
        context.res = {
            status: 500,
            body: {
                success: false,
                message: "Ein interner Serverfehler ist aufgetreten.",
                debug: error.message // Nur für Entwicklung, später entfernen!
            }
        };
    }
};

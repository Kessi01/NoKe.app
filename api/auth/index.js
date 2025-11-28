const crypto = require('crypto');
global.crypto = crypto;

const { container } = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async function (context, req) {
    try {
        if (!req.body) {
            throw new Error("Request Body ist leer.");
        }

        const { action, username, password } = req.body;

        if (!container) {
            throw new Error("Datenbankverbindung fehlgeschlagen.");
        }

        if (!action || !username || !password) {
            context.res = {
                status: 400,
                body: { success: false, message: "Fehlende Daten: action, username und password sind Pflichtfelder." }
            };
            return;
        }

        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();

        // REGISTER
        if (action === 'register') {
            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }
            
            // Passwort wird mit bcrypt gehasht (Salt-Runden: 10)
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // User-Dokument wird in Cosmos DB erstellt
            const newUserDoc = { 
                id: username + "_profile", 
                username, 
                password: hashedPassword, // Gehashtes Passwort wird hier gespeichert
                type: "user",
                createdAt: new Date().toISOString()
            };
            
            await container.items.create(newUserDoc);
            context.res = { body: { success: true, message: "User angelegt" } };

        // LOGIN
        } else if (action === 'login') {
            if (resources.length === 0) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }
            
            // Passwort wird mit dem gehashten Passwort aus der DB verglichen
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
        context.log.error("ERROR:", error.message);
        context.res = { 
            status: 500, 
            body: { 
                success: false, 
                message: "Interner Serverfehler",
                errorDetails: error.message 
            } 
        };
    }
};
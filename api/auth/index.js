const crypto = require('crypto');
global.crypto = crypto;

const { container } = require('../db');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../shared/crypto');

module.exports = async function (context, req) {
    try {
        if (!req.body) {
            throw new Error("Request Body ist leer.");
        }

        const { action, username, password, phoneNumber, code } = req.body;

        if (!container) {
            throw new Error("Datenbankverbindung fehlgeschlagen.");
        }

        if (!action || !username) {
            context.res = {
                status: 400,
                body: { success: false, message: "Fehlende Daten: action und username sind Pflichtfelder." }
            };
            return;
        }

        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        const userDoc = resources[0];

        // REGISTER
        if (action === 'register') {
            if (!password) throw new Error("Passwort fehlt");

            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }

            // Passwort wird mit bcrypt gehasht (Salt-Runden: 10)
            const hashedPassword = await bcrypt.hash(password, 10);

            // Telefonnummer verschlüsseln
            let encryptedPhone = null;
            if (phoneNumber) {
                encryptedPhone = encrypt(phoneNumber);
            }

            // User-Dokument wird in Cosmos DB erstellt
            const newUserDoc = {
                id: username + "_profile",
                username,
                password: hashedPassword, // Gehashtes Passwort wird hier gespeichert
                encryptedPhone: encryptedPhone,
                type: "user",
                createdAt: new Date().toISOString()
            };

            await container.items.create(newUserDoc);
            context.res = { body: { success: true, message: "User angelegt" } };

            // LOGIN
        } else if (action === 'login') {
            if (!password) throw new Error("Passwort fehlt");

            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            // Passwort wird mit dem gehashten Passwort aus der DB verglichen
            const valid = await bcrypt.compare(password, userDoc.password);

            if (!valid) {
                context.res = { body: { success: false, message: "Falsches Passwort" } };
                return;
            }

            // MFA CHECK
            if (userDoc.encryptedPhone) {
                // Generate 6-digit OTP
                const otp = Math.floor(100000 + Math.random() * 900000).toString();

                // Store OTP in user doc (simple approach)
                userDoc.mfaCode = otp;
                userDoc.mfaExpiry = Date.now() + 300000; // 5 minutes

                await container.items.upsert(userDoc);

                // MOCK SEND SMS
                const decryptedPhone = decrypt(userDoc.encryptedPhone);
                context.log.warn(`[MOCK SMS] Sending OTP ${otp} to ${decryptedPhone}`);

                context.res = {
                    body: {
                        success: false,
                        mfaRequired: true,
                        message: "Bitte OTP eingeben (siehe Konsole)"
                    }
                };
                return;
            }

            context.res = { body: { success: true, username } };

            // VERIFY MFA
        } else if (action === 'verify-mfa') {
            if (!code) throw new Error("Code fehlt");

            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            if (userDoc.mfaCode === code && userDoc.mfaExpiry > Date.now()) {
                // Clear OTP
                userDoc.mfaCode = null;
                userDoc.mfaExpiry = null;
                await container.items.upsert(userDoc);

                context.res = { body: { success: true, username } };
            } else {
                context.res = { body: { success: false, message: "Code ungültig oder abgelaufen" } };
            }

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
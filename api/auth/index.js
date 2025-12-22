const crypto = require('crypto');
global.crypto = crypto;

const { container } = require('../db');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../shared/crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

// App name for authenticator apps
const APP_NAME = 'NoKe';

module.exports = async function (context, req) {
    try {
        if (!req.body) {
            throw new Error("Request Body ist leer.");
        }

        const { action, username, password, code } = req.body;

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

        // ENSURE-USER (Auth0 Integration)
        // Creates a user in the database if they don't exist (for Auth0 users without password)
        if (action === 'ensure-user') {
            const { email, name, picture, auth0Id } = req.body;

            if (userDoc) {
                // User already exists - optionally update their profile
                try {
                    const updatedDoc = {
                        ...userDoc,
                        email: email || userDoc.email,
                        name: name || userDoc.name,
                        picture: picture || userDoc.picture,
                        auth0Id: auth0Id || userDoc.auth0Id,
                        lastLogin: new Date().toISOString()
                    };
                    await container.items.upsert(updatedDoc);
                    context.res = { body: { success: true, message: "User aktualisiert", exists: true } };
                } catch (e) {
                    context.log.error("Error updating user:", e);
                    context.res = { body: { success: true, message: "User existiert bereits", exists: true } };
                }
                return;
            }

            // Create new user without password (Auth0 handles authentication)
            const newUserDoc = {
                id: username + "_profile",
                username,
                email: email || username,
                name: name || username,
                picture: picture || null,
                auth0Id: auth0Id || null,
                password: null,  // No password - Auth0 handles auth
                totpEnabled: false,
                totpSecret: null,
                type: "user",
                authProvider: "auth0",
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };

            try {
                await container.items.create(newUserDoc);
                context.res = { body: { success: true, message: "User angelegt", created: true } };
            } catch (e) {
                if (e.code === 409) {
                    // User was created by another request in the meantime
                    context.res = { body: { success: true, message: "User existiert bereits", exists: true } };
                } else {
                    throw e;
                }
            }
            return;
        }

        // REGISTER
        if (action === 'register') {
            if (!password) throw new Error("Passwort fehlt");

            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }

            // Passwort wird mit bcrypt gehasht (Salt-Runden: 10)
            const hashedPassword = await bcrypt.hash(password, 10);

            // User-Dokument wird in Cosmos DB erstellt (ohne Telefonnummer)
            const newUserDoc = {
                id: username + "_profile",
                username,
                password: hashedPassword,
                totpEnabled: false,
                totpSecret: null,
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

            // MFA CHECK - if TOTP is enabled
            if (userDoc.totpEnabled && userDoc.totpSecret) {
                context.res = {
                    body: {
                        success: false,
                        mfaRequired: true,
                        message: "Bitte 2FA-Code aus Ihrer Authenticator-App eingeben"
                    }
                };
                return;
            }

            context.res = { body: { success: true, username } };

            // VERIFY MFA (TOTP)
        } else if (action === 'verify-mfa') {
            if (!code) throw new Error("Code fehlt");

            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            if (!userDoc.totpEnabled || !userDoc.totpSecret) {
                context.res = { body: { success: false, message: "2FA nicht aktiviert" } };
                return;
            }

            // Decrypt the stored secret
            const secret = decrypt(userDoc.totpSecret);

            // Verify the TOTP code
            const isValid = authenticator.verify({ token: code, secret });

            if (isValid) {
                context.res = { body: { success: true, username } };
            } else {
                context.res = { body: { success: false, message: "Ungültiger Code" } };
            }

            // SETUP TOTP - Generate secret and QR code
        } else if (action === 'setup-totp') {
            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            // Generate a new secret
            const secret = authenticator.generateSecret();

            // Create the otpauth URL for QR code
            const otpauthUrl = authenticator.keyuri(username, APP_NAME, secret);

            // Generate QR code as data URL
            const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

            // Store encrypted secret temporarily (not enabled yet)
            userDoc.totpSecretPending = encrypt(secret);
            await container.items.upsert(userDoc);

            context.res = {
                body: {
                    success: true,
                    qrCode: qrCodeDataUrl,
                    secret: secret, // Also provide secret for manual entry
                    message: "Scannen Sie den QR-Code mit Ihrer Authenticator-App"
                }
            };

            // ENABLE TOTP - Verify first code and enable
        } else if (action === 'enable-totp') {
            if (!code) throw new Error("Code fehlt");

            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            if (!userDoc.totpSecretPending) {
                context.res = { body: { success: false, message: "Bitte zuerst QR-Code generieren" } };
                return;
            }

            // Decrypt the pending secret
            const secret = decrypt(userDoc.totpSecretPending);

            // Verify the code
            const isValid = authenticator.verify({ token: code, secret });

            if (isValid) {
                // Enable TOTP
                userDoc.totpSecret = userDoc.totpSecretPending;
                userDoc.totpEnabled = true;
                delete userDoc.totpSecretPending;
                await container.items.upsert(userDoc);

                context.res = { body: { success: true, message: "2FA erfolgreich aktiviert!" } };
            } else {
                context.res = { body: { success: false, message: "Ungültiger Code - bitte erneut versuchen" } };
            }

            // DISABLE TOTP
        } else if (action === 'disable-totp') {
            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            userDoc.totpEnabled = false;
            userDoc.totpSecret = null;
            delete userDoc.totpSecretPending;
            await container.items.upsert(userDoc);

            context.res = { body: { success: true, message: "2FA deaktiviert" } };

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
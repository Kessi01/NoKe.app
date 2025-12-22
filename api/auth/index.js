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

        // GET-PROFILE - Get user profile/settings
        } else if (action === 'get-profile' || action === 'get-settings') {
            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            context.res = {
                body: {
                    success: true,
                    profile: {
                        firstName: userDoc.firstName || '',
                        lastName: userDoc.lastName || '',
                        displayName: userDoc.displayName || userDoc.name || '',
                        email: userDoc.email || userDoc.username,
                        company: userDoc.company || '',
                        phone: userDoc.phone || '',
                        picture: userDoc.picture || null,
                        theme: userDoc.theme || 'dark',
                        language: userDoc.language || 'de',
                        totpEnabled: userDoc.totpEnabled || false,
                        auth0Id: userDoc.auth0Id || null,
                        createdAt: userDoc.createdAt || null,
                        lastLogin: userDoc.lastLogin || null
                    }
                }
            };

        // UPDATE-PROFILE - Save user profile/settings
        } else if (action === 'update-profile' || action === 'save-settings') {
            if (!userDoc) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }

            const { firstName, lastName, displayName, company, phone, theme, language } = req.body;

            if (firstName !== undefined) userDoc.firstName = firstName;
            if (lastName !== undefined) userDoc.lastName = lastName;
            if (displayName !== undefined) userDoc.displayName = displayName;
            if (company !== undefined) userDoc.company = company;
            if (phone !== undefined) userDoc.phone = phone;
            if (theme !== undefined) userDoc.theme = theme;
            if (language !== undefined) userDoc.language = language;
            userDoc.updatedAt = new Date().toISOString();

            await container.items.upsert(userDoc);

            context.res = { body: { success: true, message: "Profil gespeichert" } };

        // LIST-TOKENS - List all API tokens for user
        } else if (action === 'list-tokens') {
            const tokenQuery = {
                query: "SELECT c.id, c.name, c.createdAt, c.lastUsed, c.expiresAt, c.permissions, c.tokenPreview FROM c WHERE c.username = @username AND c.type = 'api_token'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources: tokens } = await container.items.query(tokenQuery).fetchAll();

            context.res = {
                body: {
                    success: true,
                    tokens: tokens || []
                }
            };

        // CREATE-TOKEN - Create a new API token
        } else if (action === 'create-token') {
            const { name, permissions, expiryDays } = req.body;

            // Generate secure token
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            // Calculate expiry
            let expiresAt = null;
            if (expiryDays && expiryDays > 0) {
                expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
            }

            const tokenDoc = {
                id: `token_${crypto.randomUUID()}`,
                username: username,
                name: name || 'API Token',
                tokenHash: tokenHash,
                tokenPreview: rawToken.substring(0, 8) + '...',
                permissions: permissions || { read: true, write: false, delete: false },
                type: 'api_token',
                createdAt: new Date().toISOString(),
                lastUsed: null,
                expiresAt: expiresAt
            };

            await container.items.create(tokenDoc);

            context.res = {
                body: {
                    success: true,
                    message: "Token erstellt",
                    token: rawToken,  // Only returned once!
                    tokenId: tokenDoc.id,
                    expiresAt: expiresAt
                }
            };

        // REVOKE-TOKEN - Delete/revoke an API token
        } else if (action === 'revoke-token') {
            const { tokenId } = req.body;

            if (!tokenId) {
                context.res = { status: 400, body: { success: false, message: "Token ID fehlt" } };
                return;
            }

            // Verify token belongs to user
            const tokenQuery = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.username = @username AND c.type = 'api_token'",
                parameters: [
                    { name: "@id", value: tokenId },
                    { name: "@username", value: username }
                ]
            };

            const { resources: tokens } = await container.items.query(tokenQuery).fetchAll();

            if (tokens.length === 0) {
                context.res = { status: 404, body: { success: false, message: "Token nicht gefunden" } };
                return;
            }

            await container.item(tokenId, username).delete();

            context.res = { body: { success: true, message: "Token widerrufen" } };

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
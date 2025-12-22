const crypto = require('crypto');
const { container } = require('../db');
const { decrypt } = require('../shared/crypto');

// Hash token for comparison
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate API token and return username if valid
 */
async function validateToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { valid: false, error: "Authorization header fehlt oder ungültig" };
    }

    const token = authHeader.substring(7);
    const tokenHash = hashToken(token);

    const querySpec = {
        query: "SELECT * FROM c WHERE c.tokenHash = @hash AND c.type = 'api_token'",
        parameters: [{ name: "@hash", value: tokenHash }]
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    
    if (resources.length === 0) {
        return { valid: false, error: "Token ungültig" };
    }

    const tokenDoc = resources[0];

    if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt) < new Date()) {
        return { valid: false, error: "Token abgelaufen" };
    }

    // Update last used
    tokenDoc.lastUsed = new Date().toISOString();
    await container.items.upsert(tokenDoc);

    return { valid: true, username: tokenDoc.username };
}

/**
 * Plugin API Endpoint
 * 
 * Actions:
 * - GET /api/plugin/entries - Get all password entries for autofill
 * - GET /api/plugin/search?url=... - Search entries by URL
 * - POST /api/plugin/generate - Generate a random password
 */
module.exports = async function (context, req) {
    try {
        const action = context.bindingData.action || 'entries';
        
        // Validate token
        const authResult = await validateToken(req.headers['authorization']);
        if (!authResult.valid) {
            context.res = {
                status: 401,
                body: { success: false, message: authResult.error }
            };
            return;
        }

        const username = authResult.username;

        // GET /api/plugin/entries - Get all entries
        if (action === 'entries' && req.method === 'GET') {
            const querySpec = {
                query: "SELECT * FROM c WHERE c.username = @username AND c.type = 'entry'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            // Decrypt passwords and format for plugin
            const entries = resources.map(entry => ({
                id: entry.id,
                title: entry.title,
                username: entry.entryUsername || entry.user,
                password: entry.password ? decrypt(entry.password) : '',
                url: entry.url || '',
                notes: entry.notes || '',
                folder: entry.folder || null
            }));

            context.res = {
                body: { success: true, entries }
            };
            return;
        }

        // GET /api/plugin/search?url=... - Search by URL
        if (action === 'search' && req.method === 'GET') {
            const searchUrl = req.query.url;
            
            if (!searchUrl) {
                context.res = {
                    status: 400,
                    body: { success: false, message: "URL Parameter erforderlich" }
                };
                return;
            }

            // Extract domain from URL
            let domain;
            try {
                const urlObj = new URL(searchUrl);
                domain = urlObj.hostname.replace('www.', '');
            } catch {
                domain = searchUrl.replace('www.', '');
            }

            const querySpec = {
                query: "SELECT * FROM c WHERE c.username = @username AND c.type = 'entry'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            // Filter entries that match the domain
            const matchingEntries = resources.filter(entry => {
                if (!entry.url) return false;
                try {
                    const entryDomain = new URL(entry.url).hostname.replace('www.', '');
                    return entryDomain.includes(domain) || domain.includes(entryDomain);
                } catch {
                    return entry.url.includes(domain);
                }
            });

            const entries = matchingEntries.map(entry => ({
                id: entry.id,
                title: entry.title,
                username: entry.entryUsername || entry.user,
                password: entry.password ? decrypt(entry.password) : '',
                url: entry.url || ''
            }));

            context.res = {
                body: { success: true, entries, matchedDomain: domain }
            };
            return;
        }

        // POST /api/plugin/generate - Generate password
        if (action === 'generate' && req.method === 'POST') {
            const { length = 16, uppercase = true, lowercase = true, numbers = true, symbols = true } = req.body || {};

            let chars = '';
            if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
            if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (numbers) chars += '0123456789';
            if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

            if (!chars) {
                context.res = {
                    status: 400,
                    body: { success: false, message: "Mindestens eine Zeichenkategorie muss aktiviert sein" }
                };
                return;
            }

            let password = '';
            const randomBytes = crypto.randomBytes(length);
            for (let i = 0; i < length; i++) {
                password += chars[randomBytes[i] % chars.length];
            }

            context.res = {
                body: { success: true, password }
            };
            return;
        }

        context.res = {
            status: 404,
            body: { success: false, message: "Aktion nicht gefunden" }
        };

    } catch (error) {
        context.log.error("Plugin API Error:", error);
        context.res = {
            status: 500,
            body: { success: false, message: error.message }
        };
    }
};

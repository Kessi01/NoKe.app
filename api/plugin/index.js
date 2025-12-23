const crypto = require('crypto');
const { container } = require('../db');
const { decrypt } = require('../shared/crypto');

// Generate secure random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Hash token for comparison
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Extract API token from request headers
 * Supports: x-api-key, Authorization: Bearer
 */
function extractToken(req) {
    // Method 1: x-api-key header (preferred for plugins)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return apiKey;
    }

    // Method 2: Authorization Bearer header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return null;
}

/**
 * Validate authentication - supports both:
 * 1. Rolling Key (new): x-plugin-id + x-api-key (rolling key)
 * 2. Static Token (legacy): x-api-key only
 */
async function validateAuth(req, context) {
    const pluginId = req.headers['x-plugin-id'];
    const apiKey = extractToken(req);
    
    if (!apiKey) {
        return { valid: false, error: "API-Key fehlt. Verwende x-api-key Header." };
    }

    // Method 1: Rolling Key authentication (has plugin-id header)
    if (pluginId) {
        const keyHash = hashToken(apiKey);
        
        const querySpec = {
            query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.authorized = true",
            parameters: [{ name: "@id", value: pluginId }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        
        if (resources.length === 0) {
            return { valid: false, error: "Plugin nicht autorisiert" };
        }

        const pluginDoc = resources[0];

        // Verify rolling key
        if (keyHash !== pluginDoc.rollingKeyHash) {
            return { 
                valid: false, 
                error: "Rolling Key ungültig. Bitte erneut autorisieren.",
                requireReauth: true
            };
        }

        // Generate NEW rolling key for next request
        const newRollingKey = generateToken();
        
        pluginDoc.rollingKeyHash = hashToken(newRollingKey);
        pluginDoc.rollingKeyCreatedAt = new Date().toISOString();
        pluginDoc.rollingKeyVersion = (pluginDoc.rollingKeyVersion || 0) + 1;
        pluginDoc.lastSeen = new Date().toISOString();

        await container.items.upsert(pluginDoc);

        return { 
            valid: true, 
            username: pluginDoc.username,
            isRollingKey: true,
            newRollingKey: newRollingKey,  // Include in response!
            keyVersion: pluginDoc.rollingKeyVersion
        };
    }

    // Method 2: Legacy static token authentication
    const tokenHash = hashToken(apiKey);

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

    return { valid: true, username: tokenDoc.username, permissions: tokenDoc.permissions, isRollingKey: false };
}

/**
 * Plugin API Endpoint
 * 
 * Authentication (supports both):
 * 1. Rolling Key: x-plugin-id + x-api-key headers
 * 2. Static Token: x-api-key or Authorization: Bearer
 * 
 * Response includes newRollingKey when using rolling key auth!
 * 
 * Actions:
 * - GET/POST /api/plugin/entries - Get all password entries for autofill
 * - GET/POST /api/plugin/search?url=... - Search entries by URL
 * - POST /api/plugin/generate - Generate a random password
 */
module.exports = async function (context, req) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-plugin-id, Authorization'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 204, headers };
        return;
    }

    try {
        const action = context.bindingData.action || 'entries';
        
        // Validate authentication (rolling key or static token)
        const authResult = await validateAuth(req, context);
        if (!authResult.valid) {
            context.res = {
                status: 401,
                headers,
                body: { 
                    success: false, 
                    message: authResult.error,
                    requireReauth: authResult.requireReauth || false
                }
            };
            return;
        }

        const username = authResult.username;
        
        // Helper to build response with rolling key if applicable
        function buildResponse(data) {
            const responseBody = { ...data };
            if (authResult.isRollingKey && authResult.newRollingKey) {
                responseBody.newRollingKey = authResult.newRollingKey;
                responseBody.keyVersion = authResult.keyVersion;
            }
            return { headers, body: responseBody };
        }

        // GET/POST /api/plugin/entries - Get all entries
        if (action === 'entries') {
            const querySpec = {
                query: "SELECT * FROM c WHERE c.username = @username AND c.type = 'entry'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            // Decrypt passwords and format for plugin
            // Fields: name (entry name), loginUsername (login username), username (owner/partition key)
            const entries = resources.map(entry => ({
                id: entry.id,
                name: entry.name || entry.title || 'Unbenannt',
                loginUsername: entry.loginUsername || entry.loginName || '',
                password: entry.password ? decrypt(entry.password) : '',
                url: entry.url || '',
                notes: entry.notes || '',
                folder: entry.folder || null
            }));

            context.res = buildResponse({ success: true, entries });
            return;
        }

        // GET/POST /api/plugin/search?url=... - Search by URL
        if (action === 'search') {
            const searchUrl = req.query.url || (req.body && req.body.url);
            
            if (!searchUrl) {
                context.res = {
                    status: 400,
                    headers,
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
                name: entry.name || entry.title || 'Unbenannt',
                loginUsername: entry.loginUsername || entry.loginName || '',
                password: entry.password ? decrypt(entry.password) : '',
                url: entry.url || '',
                notes: entry.notes || '',
                folder: entry.folder || null
            }));

            context.res = buildResponse({ success: true, entries, matchedDomain: domain });
            return;
        }

        // POST /api/plugin/generate - Generate password
        if (action === 'generate') {
            const { length = 16, uppercase = true, lowercase = true, numbers = true, symbols = true } = req.body || {};

            let chars = '';
            if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
            if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (numbers) chars += '0123456789';
            if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

            if (!chars) {
                context.res = {
                    status: 400,
                    headers,
                    body: { success: false, message: "Mindestens eine Zeichenkategorie muss aktiviert sein" }
                };
                return;
            }

            let password = '';
            const randomBytes = crypto.randomBytes(length);
            for (let i = 0; i < length; i++) {
                password += chars[randomBytes[i] % chars.length];
            }

            context.res = buildResponse({ success: true, password });
            return;
        }

        context.res = {
            status: 404,
            headers,
            body: { success: false, message: "Aktion nicht gefunden: " + action }
        };

    } catch (error) {
        context.log.error("Plugin API Error:", error);
        context.res = {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: { success: false, message: error.message }
        };
    }
};

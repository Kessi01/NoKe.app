const crypto = require('crypto');
const { container } = require('../db');

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
 * Validate an API token and return user information if valid.
 * This endpoint is used by the browser plugin to authenticate API requests.
 * 
 * Supports both:
 * - x-api-key: <token>
 * - Authorization: Bearer <token>
 */
module.exports = async function (context, req) {
    try {
        const token = extractToken(req);
        
        if (!token) {
            context.res = {
                status: 401,
                body: { success: false, message: "API-Key fehlt. Verwende x-api-key Header." }
            };
            return;
        }

        const tokenHash = hashToken(token);

        // Find the token in the database
        const querySpec = {
            query: "SELECT * FROM c WHERE c.tokenHash = @hash AND c.type = 'api_token'",
            parameters: [{ name: "@hash", value: tokenHash }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        
        if (resources.length === 0) {
            context.res = {
                status: 401,
                body: { success: false, message: "Token ungültig" }
            };
            return;
        }

        const tokenDoc = resources[0];

        // Check if token is expired
        if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt) < new Date()) {
            context.res = {
                status: 401,
                body: { success: false, message: "Token abgelaufen" }
            };
            return;
        }

        // Update last used timestamp
        tokenDoc.lastUsed = new Date().toISOString();
        await container.items.upsert(tokenDoc);

        // Return success with user information
        context.res = {
            body: { 
                success: true, 
                username: tokenDoc.username,
                tokenName: tokenDoc.name
            }
        };

    } catch (error) {
        context.log.error("Token validation error:", error);
        context.res = {
            status: 500,
            body: { success: false, message: "Interner Fehler" }
        };
    }
};

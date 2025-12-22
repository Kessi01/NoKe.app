const crypto = require('crypto');
const { container } = require('../db');

// Hash token for comparison
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate an API token and return user information if valid.
 * This endpoint is used by the browser plugin to authenticate API requests.
 */
module.exports = async function (context, req) {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            context.res = {
                status: 401,
                body: { success: false, message: "Authorization header fehlt oder ungültig" }
            };
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
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

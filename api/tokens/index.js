const crypto = require('crypto');
const { container } = require('../db');

// Generate a secure API token
function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Hash token for storage (we only store hashes, not the actual tokens)
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = async function (context, req) {
    try {
        const method = req.method.toUpperCase();
        const tokenId = context.bindingData.tokenId;

        // GET - List all tokens for a user
        if (method === 'GET') {
            const username = req.query.username || req.headers['x-user'];
            
            if (!username) {
                context.res = {
                    status: 400,
                    body: { success: false, message: "Username erforderlich" }
                };
                return;
            }

            const querySpec = {
                query: "SELECT c.id, c.name, c.createdAt, c.lastUsed, c.expiresAt FROM c WHERE c.username = @username AND c.type = 'api_token'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            context.res = {
                body: { 
                    success: true, 
                    tokens: resources.map(t => ({
                        id: t.id,
                        name: t.name,
                        createdAt: t.createdAt,
                        lastUsed: t.lastUsed,
                        expiresAt: t.expiresAt
                    }))
                }
            };
            return;
        }

        // POST - Create a new API token
        if (method === 'POST') {
            const { username, name, expiresIn } = req.body;

            if (!username) {
                context.res = {
                    status: 400,
                    body: { success: false, message: "Username erforderlich" }
                };
                return;
            }

            // Generate the actual token (this is what the user sees once)
            const rawToken = generateSecureToken();
            const tokenHash = hashToken(rawToken);

            // Calculate expiration date
            let expiresAt = null;
            if (expiresIn) {
                const now = new Date();
                switch (expiresIn) {
                    case '30d':
                        expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case '90d':
                        expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case '1y':
                        expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
                        break;
                    case 'never':
                    default:
                        expiresAt = null;
                        break;
                }
            }

            const tokenDoc = {
                id: `token_${crypto.randomUUID()}`,
                username: username,
                name: name || 'API Token',
                tokenHash: tokenHash,
                type: 'api_token',
                createdAt: new Date().toISOString(),
                lastUsed: null,
                expiresAt: expiresAt
            };

            await container.items.create(tokenDoc);

            // Return the raw token only once - it cannot be retrieved later
            context.res = {
                body: { 
                    success: true, 
                    message: "Token erstellt",
                    token: rawToken,
                    tokenId: tokenDoc.id,
                    name: tokenDoc.name,
                    expiresAt: tokenDoc.expiresAt
                }
            };
            return;
        }

        // DELETE - Revoke a token
        if (method === 'DELETE') {
            const username = req.query.username || req.headers['x-user'];

            if (!tokenId || !username) {
                context.res = {
                    status: 400,
                    body: { success: false, message: "Token ID und Username erforderlich" }
                };
                return;
            }

            // First verify the token belongs to this user
            const querySpec = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.username = @username AND c.type = 'api_token'",
                parameters: [
                    { name: "@id", value: tokenId },
                    { name: "@username", value: username }
                ]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            if (resources.length === 0) {
                context.res = {
                    status: 404,
                    body: { success: false, message: "Token nicht gefunden" }
                };
                return;
            }

            // Delete the token
            await container.item(tokenId, username).delete();

            context.res = {
                body: { success: true, message: "Token widerrufen" }
            };
            return;
        }

        context.res = {
            status: 405,
            body: { success: false, message: "Methode nicht erlaubt" }
        };

    } catch (error) {
        context.log.error("Token API Error:", error);
        context.res = {
            status: 500,
            body: { success: false, message: error.message }
        };
    }
};

/**
 * Plugin Authentication API
 * 
 * Handles plugin-specific authentication with:
 * - Plugin ID verification (unique identifier per browser installation)
 * - Rolling keys (new token returned with each request)
 * - Auto-token generation for authorized plugins
 * 
 * Routes:
 * POST /api/plugin-auth/register - Register a new plugin instance
 * POST /api/plugin-auth/authorize - Authorize plugin and get initial token
 * POST /api/plugin-auth/exchange - Exchange rolling key for new token
 * POST /api/plugin-auth/revoke - Revoke plugin authorization
 */

const crypto = require('crypto');
const { container } = require('../db');
const { encrypt, decrypt } = require('../shared/crypto');

// Generate secure random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Hash token for storage
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate unique plugin ID
function generatePluginId() {
    return 'plugin_' + crypto.randomUUID();
}

/**
 * CORS headers for plugin requests
 */
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-plugin-id, Authorization'
    };
}

module.exports = async function (context, req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 204,
            headers: corsHeaders()
        };
        return;
    }

    const action = context.bindingData.action || 'status';
    
    context.log(`Plugin-Auth action: ${action}`);

    try {
        // =====================================================
        // REGISTER - Generate a new plugin ID for installation
        // Called once when plugin is first installed
        // =====================================================
        if (action === 'register') {
            const pluginId = generatePluginId();
            const pluginSecret = generateToken();
            
            // Store plugin registration (without user association yet)
            // Use "_plugins" as partition key for unassociated plugins
            const pluginDoc = {
                id: pluginId,
                type: 'plugin_instance',
                pluginIdHash: hashToken(pluginId),
                pluginSecretHash: hashToken(pluginSecret),
                username: '_plugins',  // Partition key for unassociated plugins
                ownerUsername: null,   // Will be set when authorized
                authorized: false,
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };

            await container.items.create(pluginDoc);

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    pluginId: pluginId,
                    pluginSecret: pluginSecret,  // Only returned once!
                    message: 'Plugin registriert. Öffne NoKe zur Autorisierung.'
                }
            };
            return;
        }

        // =====================================================
        // REQUEST-AUTH - Plugin requests authorization
        // Opens NoKe web app with plugin info for user approval
        // =====================================================
        if (action === 'request-auth') {
            const { pluginId, pluginSecret } = req.body || {};

            if (!pluginId || !pluginSecret) {
                context.res = {
                    status: 400,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin ID und Secret erforderlich' }
                };
                return;
            }

            // Verify plugin registration - search in _plugins partition first
            const querySpec = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.username = '_plugins'",
                parameters: [{ name: "@id", value: pluginId }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            if (resources.length === 0) {
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin nicht registriert' }
                };
                return;
            }

            const pluginDoc = resources[0];

            // Verify secret
            if (hashToken(pluginSecret) !== pluginDoc.pluginSecretHash) {
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin Secret ungültig' }
                };
                return;
            }

            // Generate auth request token (short-lived)
            const authRequestToken = generateToken();
            pluginDoc.authRequestToken = hashToken(authRequestToken);
            pluginDoc.authRequestExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
            pluginDoc.lastSeen = new Date().toISOString();
            
            await container.items.upsert(pluginDoc);

            // Return URL for authorization
            const authUrl = `https://blue-glacier-05eee0b03.3.azurestaticapps.net/#/plugin-auth?pluginId=${encodeURIComponent(pluginId)}&authToken=${encodeURIComponent(authRequestToken)}`;

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    authUrl: authUrl,
                    authToken: authRequestToken,
                    expiresIn: 300  // seconds
                }
            };
            return;
        }

        // =====================================================
        // AUTHORIZE - User approves plugin (called from web app)
        // Creates the rolling key for the plugin
        // =====================================================
        if (action === 'authorize') {
            const { pluginId, authToken, username } = req.body || {};

            context.log(`Authorize request: pluginId=${pluginId}, username=${username}`);

            if (!pluginId || !authToken || !username) {
                context.res = {
                    status: 400,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin ID, Auth Token und Username erforderlich' }
                };
                return;
            }

            // Find plugin (check both in _plugins partition and user partition)
            let pluginDoc = null;
            let oldPartitionKey = null;
            
            // First check _plugins partition (unassociated plugins)
            const querySpec1 = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.username = '_plugins'",
                parameters: [{ name: "@id", value: pluginId }]
            };
            let { resources } = await container.items.query(querySpec1).fetchAll();
            
            if (resources.length > 0) {
                pluginDoc = resources[0];
                oldPartitionKey = '_plugins';
                context.log('Found plugin in _plugins partition');
            } else {
                // Check if already associated with this user
                const querySpec2 = {
                    query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.username = @username",
                    parameters: [
                        { name: "@id", value: pluginId },
                        { name: "@username", value: username }
                    ]
                };
                const result2 = await container.items.query(querySpec2).fetchAll();
                if (result2.resources.length > 0) {
                    pluginDoc = result2.resources[0];
                    oldPartitionKey = username;
                    context.log('Found plugin already associated with user');
                }
            }
            
            if (!pluginDoc) {
                context.log('Plugin not found in any partition');
                context.res = {
                    status: 404,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin nicht gefunden' }
                };
                return;
            }

            // Verify auth token
            if (hashToken(authToken) !== pluginDoc.authRequestToken) {
                context.log('Auth token mismatch');
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Auth Token ungültig' }
                };
                return;
            }

            // Check if auth request expired
            if (new Date(pluginDoc.authRequestExpiry) < new Date()) {
                context.log('Auth token expired');
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Auth Token abgelaufen' }
                };
                return;
            }

            // Generate initial rolling key
            const rollingKey = generateToken();

            // If partition key is changing, we need to delete old and create new
            if (oldPartitionKey !== username) {
                context.log(`Partition key changing from ${oldPartitionKey} to ${username}`);
                
                // Delete old document
                try {
                    await container.item(pluginDoc.id, oldPartitionKey).delete();
                    context.log('Deleted old document');
                } catch (delError) {
                    context.log('Error deleting old document:', delError.message);
                }
            }

            // Create/Update plugin document with user association
            const newPluginDoc = {
                ...pluginDoc,
                username: username,  // New partition key
                ownerUsername: username,
                authorized: true,
                rollingKeyHash: hashToken(rollingKey),
                pendingRollingKey: encrypt(rollingKey),
                rollingKeyCreatedAt: new Date().toISOString(),
                rollingKeyVersion: 1,
                authorizedAt: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };
            
            // Clear auth request data
            delete newPluginDoc.authRequestToken;
            delete newPluginDoc.authRequestExpiry;

            await container.items.upsert(newPluginDoc);
            context.log('Plugin authorized and saved');

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    username: username,
                    message: 'Plugin erfolgreich autorisiert'
                }
            };
            return;
        }

        // =====================================================
        // CHECK-AUTH - Plugin checks if it was authorized
        // Called by plugin after user approves in web app
        // =====================================================
        if (action === 'check-auth') {
            const { pluginId, pluginSecret } = req.body || {};

            context.log(`check-auth: pluginId=${pluginId}`);

            if (!pluginId || !pluginSecret) {
                context.res = {
                    status: 400,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin ID und Secret erforderlich' }
                };
                return;
            }

            // Find plugin - first check _plugins partition (not yet authorized)
            let pluginDoc = null;
            
            const querySpec1 = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.username = '_plugins'",
                parameters: [{ name: "@id", value: pluginId }]
            };
            let { resources } = await container.items.query(querySpec1).fetchAll();
            
            if (resources.length > 0) {
                pluginDoc = resources[0];
                context.log('Found in _plugins partition, not yet authorized');
            } else {
                // Check all user partitions (cross-partition query)
                const querySpec2 = {
                    query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.username != '_plugins'",
                    parameters: [{ name: "@id", value: pluginId }]
                };
                const result2 = await container.items.query(querySpec2).fetchAll();
                if (result2.resources.length > 0) {
                    pluginDoc = result2.resources[0];
                    context.log('Found in user partition:', pluginDoc.username);
                }
            }
            
            if (!pluginDoc) {
                context.log('Plugin not found');
                context.res = {
                    status: 404,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin nicht gefunden' }
                };
                return;
            }

            // Verify secret
            if (hashToken(pluginSecret) !== pluginDoc.pluginSecretHash) {
                context.log('Secret mismatch');
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin Secret ungültig' }
                };
                return;
            }

            // Check if authorized (ownerUsername is set when authorized)
            if (!pluginDoc.authorized || !pluginDoc.ownerUsername) {
                context.log('Not yet authorized');
                context.res = {
                    headers: corsHeaders(),
                    body: { 
                        success: false, 
                        authorized: false,
                        message: 'Warte auf Autorisierung...'
                    }
                };
                return;
            }

            context.log('Plugin is authorized, checking for pending rolling key');

            // Get the pending rolling key (set during authorize)
            let rollingKey = null;
            if (pluginDoc.pendingRollingKey) {
                // Decrypt the pending rolling key
                rollingKey = decrypt(pluginDoc.pendingRollingKey);
                context.log('Decrypted pending rolling key');
                
                // Clear pending key after retrieval (one-time use)
                delete pluginDoc.pendingRollingKey;
                pluginDoc.lastSeen = new Date().toISOString();
                await container.items.upsert(pluginDoc);
                context.log('Cleared pending key from DB');
            } else {
                context.log('No pending rolling key found');
                context.res = {
                    headers: corsHeaders(),
                    body: { 
                        success: false, 
                        authorized: true,
                        message: 'Rolling Key bereits abgerufen. Bitte erneut autorisieren.',
                        requireReauth: true
                    }
                };
                return;
            }

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    authorized: true,
                    username: pluginDoc.ownerUsername,
                    rollingKey: rollingKey
                }
            };
            return;
        }

        // =====================================================
        // VALIDATE - Validate rolling key and get new one
        // Used for every API request from the plugin
        // =====================================================
        if (action === 'validate') {
            const pluginId = req.headers['x-plugin-id'];
            const rollingKey = req.headers['x-api-key'] || req.headers['x-rolling-key'];

            if (!pluginId || !rollingKey) {
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin ID und Rolling Key erforderlich' }
                };
                return;
            }

            // Find plugin
            const querySpec = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'plugin_instance' AND c.authorized = true",
                parameters: [{ name: "@id", value: pluginId }]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            if (resources.length === 0) {
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin nicht autorisiert' }
                };
                return;
            }

            const pluginDoc = resources[0];

            // Verify rolling key
            if (hashToken(rollingKey) !== pluginDoc.rollingKeyHash) {
                // Key mismatch - could be replay attack or key out of sync
                context.res = {
                    status: 401,
                    headers: corsHeaders(),
                    body: { 
                        success: false, 
                        message: 'Rolling Key ungültig. Bitte erneut autorisieren.',
                        requireReauth: true
                    }
                };
                return;
            }

            // Generate NEW rolling key
            const newRollingKey = generateToken();
            
            pluginDoc.rollingKeyHash = hashToken(newRollingKey);
            pluginDoc.rollingKeyCreatedAt = new Date().toISOString();
            pluginDoc.rollingKeyVersion = (pluginDoc.rollingKeyVersion || 0) + 1;
            pluginDoc.lastSeen = new Date().toISOString();

            await container.items.upsert(pluginDoc);

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    username: pluginDoc.username,
                    newRollingKey: newRollingKey,  // MUST be stored and used for next request
                    keyVersion: pluginDoc.rollingKeyVersion
                }
            };
            return;
        }

        // =====================================================
        // REVOKE - Revoke plugin authorization
        // =====================================================
        if (action === 'revoke') {
            const { pluginId, username } = req.body || {};

            if (!pluginId || !username) {
                context.res = {
                    status: 400,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin ID und Username erforderlich' }
                };
                return;
            }

            // Find plugin belonging to user
            const querySpec = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.username = @username AND c.type = 'plugin_instance'",
                parameters: [
                    { name: "@id", value: pluginId },
                    { name: "@username", value: username }
                ]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            
            if (resources.length === 0) {
                context.res = {
                    status: 404,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Plugin nicht gefunden' }
                };
                return;
            }

            const pluginDoc = resources[0];

            // Revoke authorization
            pluginDoc.authorized = false;
            pluginDoc.username = null;
            pluginDoc.rollingKeyHash = null;
            pluginDoc.rollingKeyVersion = 0;
            pluginDoc.revokedAt = new Date().toISOString();

            await container.items.upsert(pluginDoc);

            context.res = {
                headers: corsHeaders(),
                body: { success: true, message: 'Plugin-Autorisierung widerrufen' }
            };
            return;
        }

        // =====================================================
        // LIST - List all authorized plugins for user
        // =====================================================
        if (action === 'list') {
            const { username } = req.body || {};

            if (!username) {
                context.res = {
                    status: 400,
                    headers: corsHeaders(),
                    body: { success: false, message: 'Username erforderlich' }
                };
                return;
            }

            const querySpec = {
                query: "SELECT c.id, c.authorized, c.authorizedAt, c.lastSeen, c.rollingKeyVersion FROM c WHERE c.username = @username AND c.type = 'plugin_instance'",
                parameters: [{ name: "@username", value: username }]
            };

            const { resources: plugins } = await container.items.query(querySpec).fetchAll();

            context.res = {
                headers: corsHeaders(),
                body: {
                    success: true,
                    plugins: plugins || []
                }
            };
            return;
        }

        // Unknown action
        context.res = {
            status: 400,
            headers: corsHeaders(),
            body: { success: false, message: `Unbekannte Action: ${action}` }
        };

    } catch (error) {
        context.log.error("Plugin-Auth Error:", error);
        context.res = {
            status: 500,
            headers: corsHeaders(),
            body: { success: false, message: "Interner Fehler", error: error.message }
        };
    }
};

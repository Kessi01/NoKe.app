/**
 * NoKe API Client for Browser Plugin
 * 
 * Features:
 * - Plugin ID + Rolling Key authentication (new, secure)
 * - Automatic key rotation on each request
 * - Auto-authorization flow via popup window
 * - Fallback to legacy token if needed
 */

const API_BASE_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net/api';
const AUTH_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net';

class NoKeAPI {
    constructor() {
        this.pluginId = null;
        this.pluginSecret = null;
        this.rollingKey = null;
        this.username = null;
        this.authorized = false;
        
        // Legacy support
        this.legacyToken = null;
    }

    // =====================================================
    // Storage Management
    // =====================================================
    
    async loadCredentials() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'pluginId', 
                'pluginSecret', 
                'rollingKey', 
                'username',
                'authorized',
                'legacyToken'  // Backward compatibility
            ], (result) => {
                this.pluginId = result.pluginId || null;
                this.pluginSecret = result.pluginSecret || null;
                this.rollingKey = result.rollingKey || null;
                this.username = result.username || null;
                this.authorized = result.authorized || false;
                this.legacyToken = result.legacyToken || null;
                resolve();
            });
        });
    }

    async saveCredentials() {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                pluginId: this.pluginId,
                pluginSecret: this.pluginSecret,
                rollingKey: this.rollingKey,
                username: this.username,
                authorized: this.authorized
            }, resolve);
        });
    }

    async clearCredentials() {
        return new Promise((resolve) => {
            chrome.storage.local.remove([
                'pluginId', 
                'pluginSecret', 
                'rollingKey', 
                'username',
                'authorized',
                'legacyToken'
            ], () => {
                this.pluginId = null;
                this.pluginSecret = null;
                this.rollingKey = null;
                this.username = null;
                this.authorized = false;
                this.legacyToken = null;
                resolve();
            });
        });
    }

    // Update rolling key after each request
    async updateRollingKey(newKey) {
        this.rollingKey = newKey;
        return new Promise((resolve) => {
            chrome.storage.local.set({ rollingKey: newKey }, resolve);
        });
    }

    // =====================================================
    // Registration & Authorization
    // =====================================================

    /**
     * Register this plugin instance (first-time setup)
     */
    async register() {
        const response = await fetch(`${API_BASE_URL}/plugin-auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            this.pluginId = data.pluginId;
            this.pluginSecret = data.pluginSecret;
            await this.saveCredentials();
            return { success: true, pluginId: this.pluginId };
        }

        throw new Error(data.message || 'Registrierung fehlgeschlagen');
    }

    /**
     * Start authorization flow
     * Opens NoKe web app where user authorizes the plugin
     */
    async authorize() {
        await this.loadCredentials();

        // Register if not yet done
        if (!this.pluginId || !this.pluginSecret) {
            await this.register();
        }

        // Request authorization URL
        const response = await fetch(`${API_BASE_URL}/plugin-auth/request-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pluginId: this.pluginId,
                pluginSecret: this.pluginSecret
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Autorisierungsanfrage fehlgeschlagen');
        }

        // Store auth token for checking later
        await new Promise(resolve => {
            chrome.storage.local.set({ pendingAuthToken: data.authToken }, resolve);
        });

        // Open NoKe in new tab for authorization
        window.open(data.authUrl, '_blank');

        return {
            success: true,
            waitingForAuth: true,
            authUrl: data.authUrl,
            message: 'Bitte autorisiere das Plugin in NoKe...'
        };
    }

    /**
     * Check if authorization was completed
     * Called periodically after authorize()
     */
    async checkAuthorization() {
        await this.loadCredentials();
        
        console.log('[NoKe API] checkAuthorization - pluginId:', this.pluginId ? 'exists' : 'missing');
        console.log('[NoKe API] checkAuthorization - pluginSecret:', this.pluginSecret ? 'exists' : 'missing');

        if (!this.pluginId || !this.pluginSecret) {
            return { success: false, message: 'Plugin nicht registriert' };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/plugin-auth/check-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pluginId: this.pluginId,
                    pluginSecret: this.pluginSecret
                })
            });

            const data = await response.json();
            console.log('[NoKe API] check-auth response:', data);

            if (data.success && data.authorized) {
                // Authorization complete!
                console.log('[NoKe API] Authorization complete! Rolling key received:', data.rollingKey ? 'yes' : 'no');
                this.authorized = true;
                this.username = data.username;
                this.rollingKey = data.rollingKey;
                await this.saveCredentials();
                console.log('[NoKe API] Credentials saved');

                return {
                    success: true,
                    authorized: true,
                    username: this.username
                };
            }

            // Check for requireReauth flag
            if (data.requireReauth) {
                return {
                    success: false,
                    authorized: false,
                    requireReauth: true,
                    message: data.message
                };
            }

            return {
                success: false,
                authorized: false,
                message: data.message || 'Warte auf Autorisierung...'
            };
        } catch (error) {
            console.error('[NoKe API] check-auth error:', error);
            return {
                success: false,
                authorized: false,
                message: error.message
            };
        }
    }

    // =====================================================
    // API Requests with Rolling Key
    // =====================================================

    /**
     * Make authenticated API request
     * Automatically updates rolling key after each request
     */
    async request(endpoint, options = {}) {
        await this.loadCredentials();

        // Prefer rolling key auth
        if (this.pluginId && this.rollingKey) {
            return this.requestWithRollingKey(endpoint, options);
        }

        // Fallback to legacy token
        if (this.legacyToken) {
            return this.requestWithLegacyToken(endpoint, options);
        }

        throw new Error('Nicht authentifiziert. Bitte autorisieren.');
    }

    async requestWithRollingKey(endpoint, options = {}) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'x-plugin-id': this.pluginId,
                'x-api-key': this.rollingKey,
                ...options.headers
            }
        });

        const data = await response.json();

        // Check for re-auth requirement
        if (data.requireReauth) {
            this.authorized = false;
            this.rollingKey = null;
            await this.saveCredentials();
            throw new Error('Autorisierung abgelaufen. Bitte erneut autorisieren.');
        }

        if (!response.ok) {
            throw new Error(data.message || 'API-Fehler');
        }

        // IMPORTANT: Update rolling key for next request
        if (data.newRollingKey) {
            await this.updateRollingKey(data.newRollingKey);
        }

        return data;
    }

    async requestWithLegacyToken(endpoint, options = {}) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.legacyToken,
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'API-Fehler');
        }

        return data;
    }

    // =====================================================
    // API Methods
    // =====================================================

    /**
     * Validate current authentication
     */
    async validateAuth() {
        await this.loadCredentials();

        if (this.pluginId && this.rollingKey && this.authorized) {
            try {
                // Make a simple request to validate
                const result = await this.getEntries();
                return { 
                    success: true, 
                    username: this.username,
                    method: 'rolling-key'
                };
            } catch (error) {
                if (error.message.includes('erneut autorisieren')) {
                    return { success: false, requireReauth: true };
                }
                throw error;
            }
        }

        if (this.legacyToken) {
            try {
                const response = await fetch(`${API_BASE_URL}/validate-token`, {
                    method: 'POST',
                    headers: { 'x-api-key': this.legacyToken }
                });
                const data = await response.json();
                if (data.success) {
                    this.username = data.username;
                    return { success: true, username: data.username, method: 'legacy-token' };
                }
            } catch {}
        }

        return { success: false, message: 'Nicht authentifiziert' };
    }

    /**
     * Get all password entries
     */
    async getEntries() {
        return this.request('/plugin/entries');
    }

    /**
     * Search entries by URL
     */
    async searchByUrl(url) {
        return this.request(`/plugin/search?url=${encodeURIComponent(url)}`);
    }

    /**
     * Generate a random password
     */
    async generatePassword(options = {}) {
        return this.request('/plugin/generate', {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }

    // =====================================================
    // Legacy Token Support
    // =====================================================

    /**
     * Save legacy token (for backward compatibility)
     */
    async saveLegacyToken(token) {
        this.legacyToken = token;
        return new Promise((resolve) => {
            chrome.storage.local.set({ legacyToken: token }, resolve);
        });
    }

    /**
     * Check if using legacy token
     */
    isUsingLegacyToken() {
        return !this.rollingKey && !!this.legacyToken;
    }
}

// Singleton instance
const api = new NoKeAPI();

const API_BASE_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net/api';
const AUTH_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net';

class NoKeAPI {
    constructor() {
        this.token = null;
        this.authState = null;
    }

    // Token aus Storage laden
    async loadToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['apiToken'], (result) => {
                this.token = result.apiToken || null;
                resolve(this.token);
            });
        });
    }

    // Token speichern
    async saveToken(token) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ apiToken: token }, () => {
                this.token = token;
                resolve();
            });
        });
    }

    // Token löschen (Logout)
    async clearToken() {
        return new Promise((resolve) => {
            chrome.storage.local.remove(['apiToken'], () => {
                this.token = null;
                resolve();
            });
        });
    }

    /**
     * Start authorization flow
     * Opens NoKe web app where user can create a token
     * Returns a promise that resolves when user enters token manually
     */
    async authorize() {
        // Open NoKe web app in new tab for token creation
        const authUrl = new URL(AUTH_URL);
        authUrl.hash = '/connections'; // Navigate directly to connections/tokens page
        
        window.open(authUrl.toString(), '_blank');
        
        // Return info that user needs to copy token manually
        return { 
            success: false, 
            needsManualToken: true,
            message: 'Bitte kopiere den Token aus der NoKe Web-App und füge ihn unten ein.'
        };
    }

    // API-Anfrage mit Authentifizierung
    async request(endpoint, options = {}) {
        if (!this.token) {
            await this.loadToken();
        }

        if (!this.token) {
            throw new Error('Nicht authentifiziert. Bitte API-Token eingeben.');
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'x-api-key': this.token,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'API-Fehler');
        }

        return data;
    }

    // Token validieren
    async validateToken() {
        try {
            const result = await this.request('/validate-token', { method: 'POST' });
            return result;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Alle Einträge abrufen
    async getEntries() {
        return this.request('/plugin/entries');
    }

    // Nach URL suchen
    async searchByUrl(url) {
        return this.request(`/plugin/search?url=${encodeURIComponent(url)}`);
    }

    // Passwort generieren
    async generatePassword(options = {}) {
        return this.request('/plugin/generate', {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }
}

// Singleton-Instanz exportieren
const api = new NoKeAPI();

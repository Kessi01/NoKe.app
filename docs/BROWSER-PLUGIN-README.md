# NoKe Browser-Plugin Entwickler-Dokumentation

## Übersicht

Diese Dokumentation beschreibt die API-Schnittstellen für die Entwicklung eines Browser-Plugins (Chrome/Firefox/Edge) für den NoKe Passwort-Manager.

## Authentifizierung

### API-Token generieren

1. Benutzer loggt sich in die NoKe Web-App ein (Auth0)
2. Navigiert zu **Connections** im Seitenmenü
3. Klickt auf **+ Neues Token erstellen**
4. Gibt einen Namen ein (z.B. "Chrome Plugin")
5. Wählt die Gültigkeitsdauer (30 Tage, 90 Tage, 1 Jahr, Unbegrenzt)
6. Das Token wird **einmalig** angezeigt und muss sofort kopiert werden

### Token-Verwendung

Alle API-Anfragen müssen das Token im `Authorization`-Header senden:

```
Authorization: Bearer <API_TOKEN>
```

**Beispiel:**
```javascript
fetch('https://noke-app.azurewebsites.net/api/plugin/entries', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer abc123def456...',
        'Content-Type': 'application/json'
    }
})
```

---

## API-Endpunkte

### Basis-URL

```
Produktion: https://noke-app.azurewebsites.net/api
Entwicklung: http://localhost:7071/api
```

---

### 1. Token validieren

Überprüft, ob das Token gültig ist und gibt Benutzerinformationen zurück.

**Endpoint:** `POST /validate-token`

**Headers:**
```
Authorization: Bearer <TOKEN>
```

**Response (200 OK):**
```json
{
    "success": true,
    "username": "user@example.com",
    "tokenName": "Chrome Plugin"
}
```

**Response (401 Unauthorized):**
```json
{
    "success": false,
    "message": "Token ungültig"
}
```

---

### 2. Alle Passwörter abrufen

Ruft alle gespeicherten Passwort-Einträge des Benutzers ab.

**Endpoint:** `GET /plugin/entries`

**Headers:**
```
Authorization: Bearer <TOKEN>
```

**Response (200 OK):**
```json
{
    "success": true,
    "entries": [
        {
            "id": "entry_abc123",
            "title": "GitHub",
            "username": "myuser",
            "password": "secret123",
            "url": "https://github.com",
            "notes": "Mein GitHub Account",
            "folder": "folder_xyz789"
        },
        {
            "id": "entry_def456",
            "title": "Gmail",
            "username": "user@gmail.com",
            "password": "mypassword",
            "url": "https://mail.google.com",
            "notes": "",
            "folder": null
        }
    ]
}
```

---

### 3. Passwörter nach URL suchen

Sucht Passwort-Einträge, die zur aktuellen Website-URL passen.

**Endpoint:** `GET /plugin/search?url=<URL>`

**Headers:**
```
Authorization: Bearer <TOKEN>
```

**Parameter:**
- `url` (required): Die URL der aktuellen Website

**Beispiel:**
```
GET /plugin/search?url=https://github.com/login
```

**Response (200 OK):**
```json
{
    "success": true,
    "entries": [
        {
            "id": "entry_abc123",
            "title": "GitHub",
            "username": "myuser",
            "password": "secret123",
            "url": "https://github.com"
        }
    ],
    "matchedDomain": "github.com"
}
```

---

### 4. Passwort generieren

Generiert ein sicheres zufälliges Passwort.

**Endpoint:** `POST /plugin/generate`

**Headers:**
```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
    "length": 20,
    "uppercase": true,
    "lowercase": true,
    "numbers": true,
    "symbols": true
}
```

**Parameter:**
| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| length | number | 16 | Passwortlänge (8-128) |
| uppercase | boolean | true | Großbuchstaben einschließen |
| lowercase | boolean | true | Kleinbuchstaben einschließen |
| numbers | boolean | true | Zahlen einschließen |
| symbols | boolean | true | Sonderzeichen einschließen |

**Response (200 OK):**
```json
{
    "success": true,
    "password": "K7#mP9xL2@nQ4vR8"
}
```

---

## Browser-Plugin Architektur

### Empfohlene Dateistruktur

```
noke-browser-plugin/
├── manifest.json          # Plugin-Manifest (v3 für Chrome)
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup Styles
│   └── popup.js           # Popup Logik
├── background/
│   └── service-worker.js  # Background Service Worker
├── content/
│   └── content.js         # Content Script für Autofill
├── lib/
│   └── api.js             # API-Wrapper
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── options/
    ├── options.html       # Einstellungsseite
    └── options.js
```

---

### Manifest.json (Chrome/Edge - Manifest V3)

```json
{
    "manifest_version": 3,
    "name": "NoKe Passwort-Manager",
    "version": "1.0.0",
    "description": "Autofill-Plugin für den NoKe Passwort-Manager",
    
    "permissions": [
        "storage",
        "activeTab",
        "tabs"
    ],
    
    "host_permissions": [
        "https://noke-app.azurewebsites.net/*",
        "<all_urls>"
    ],
    
    "action": {
        "default_popup": "popup/popup.html",
        "default_icon": {
            "16": "icons/icon16.png",
            "32": "icons/icon32.png",
            "48": "icons/icon48.png",
            "128": "icons/icon128.png"
        }
    },
    
    "background": {
        "service_worker": "background/service-worker.js"
    },
    
    "content_scripts": [
        {
            "matches": ["<all_urls>"],
            "js": ["content/content.js"],
            "css": [],
            "run_at": "document_idle"
        }
    ],
    
    "options_page": "options/options.html",
    
    "icons": {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
    }
}
```

---

### API-Wrapper (lib/api.js)

```javascript
const API_BASE_URL = 'https://noke-app.azurewebsites.net/api';

class NoKeAPI {
    constructor() {
        this.token = null;
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
                'Authorization': `Bearer ${this.token}`,
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
```

---

### Popup UI (popup/popup.html)

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NoKe</title>
    <link rel="stylesheet" href="popup.css">
</head>
<body>
    <!-- Login-Ansicht -->
    <div id="login-view" class="view">
        <div class="logo">
            <img src="../icons/icon48.png" alt="NoKe">
            <h1>NoKe</h1>
        </div>
        <p class="description">
            Gib dein API-Token ein, das du in der NoKe Web-App generiert hast.
        </p>
        <input type="password" id="token-input" placeholder="API-Token einfügen">
        <button id="login-btn" class="primary-btn">Verbinden</button>
        <p class="error" id="login-error"></p>
    </div>

    <!-- Haupt-Ansicht -->
    <div id="main-view" class="view hidden">
        <div class="header">
            <img src="../icons/icon32.png" alt="NoKe">
            <span id="user-email"></span>
            <button id="logout-btn" class="icon-btn" title="Abmelden">🚪</button>
        </div>
        
        <div class="search-box">
            <input type="text" id="search-input" placeholder="Suchen...">
        </div>

        <div id="entries-list" class="entries-list">
            <!-- Einträge werden hier dynamisch eingefügt -->
        </div>

        <div class="footer">
            <button id="generate-btn" class="secondary-btn">🔐 Passwort generieren</button>
        </div>
    </div>

    <!-- Passwort-Generator Modal -->
    <div id="generator-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Passwort generieren</h2>
            <div class="generated-password">
                <input type="text" id="generated-password" readonly>
                <button id="copy-password-btn" title="Kopieren">📋</button>
            </div>
            <div class="generator-options">
                <label>
                    <span>Länge: <span id="length-value">16</span></span>
                    <input type="range" id="password-length" min="8" max="64" value="16">
                </label>
                <label>
                    <input type="checkbox" id="opt-uppercase" checked> Großbuchstaben
                </label>
                <label>
                    <input type="checkbox" id="opt-lowercase" checked> Kleinbuchstaben
                </label>
                <label>
                    <input type="checkbox" id="opt-numbers" checked> Zahlen
                </label>
                <label>
                    <input type="checkbox" id="opt-symbols" checked> Sonderzeichen
                </label>
            </div>
            <button id="regenerate-btn" class="secondary-btn">🔄 Neu generieren</button>
            <button id="close-generator-btn" class="text-btn">Schließen</button>
        </div>
    </div>

    <script src="../lib/api.js"></script>
    <script src="popup.js"></script>
</body>
</html>
```

---

### Popup Styles (popup/popup.css)

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    width: 350px;
    min-height: 400px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a1a;
    color: #fff;
}

.view {
    padding: 16px;
}

.hidden {
    display: none !important;
}

/* Logo */
.logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 24px;
}

.logo h1 {
    color: #C49C48;
    font-size: 24px;
}

.description {
    text-align: center;
    color: #888;
    font-size: 14px;
    margin-bottom: 20px;
}

/* Inputs */
input[type="text"],
input[type="password"] {
    width: 100%;
    padding: 12px 16px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    margin-bottom: 12px;
}

input[type="text"]:focus,
input[type="password"]:focus {
    outline: none;
    border-color: #C49C48;
}

/* Buttons */
.primary-btn {
    width: 100%;
    padding: 12px 24px;
    background: #C49C48;
    color: #000;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.primary-btn:hover {
    background: #d4a84e;
}

.secondary-btn {
    padding: 8px 16px;
    background: #2a2a2a;
    color: #C49C48;
    border: 1px solid #C49C48;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.secondary-btn:hover {
    background: #C49C48;
    color: #000;
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
}

.text-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    margin-top: 12px;
}

.text-btn:hover {
    color: #fff;
}

/* Header */
.header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid #333;
    margin-bottom: 16px;
}

.header span {
    flex: 1;
    font-size: 14px;
    color: #888;
}

/* Search */
.search-box {
    margin-bottom: 16px;
}

/* Entries List */
.entries-list {
    max-height: 300px;
    overflow-y: auto;
}

.entry-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #2a2a2a;
    border-radius: 8px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.2s;
}

.entry-item:hover {
    background: #333;
}

.entry-icon {
    width: 32px;
    height: 32px;
    background: #444;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
}

.entry-info {
    flex: 1;
}

.entry-title {
    font-weight: 500;
    margin-bottom: 2px;
}

.entry-username {
    font-size: 12px;
    color: #888;
}

.entry-actions {
    display: flex;
    gap: 4px;
}

/* Footer */
.footer {
    padding-top: 16px;
    border-top: 1px solid #333;
    margin-top: 16px;
}

/* Error */
.error {
    color: #ff4444;
    font-size: 12px;
    margin-top: 8px;
    text-align: center;
}

/* Modal */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
}

.modal-content {
    background: #2a2a2a;
    border-radius: 12px;
    padding: 24px;
    width: 100%;
}

.modal-content h2 {
    color: #C49C48;
    margin-bottom: 16px;
    font-size: 18px;
}

.generated-password {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
}

.generated-password input {
    flex: 1;
    font-family: monospace;
    font-size: 16px;
}

.generator-options {
    margin-bottom: 16px;
}

.generator-options label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    color: #ccc;
    font-size: 14px;
}

.generator-options input[type="range"] {
    flex: 1;
    margin-left: 12px;
}

.generator-options input[type="checkbox"] {
    width: 18px;
    height: 18px;
}
```

---

### Popup Logik (popup/popup.js)

```javascript
// DOM Elements
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const tokenInput = document.getElementById('token-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const searchInput = document.getElementById('search-input');
const entriesList = document.getElementById('entries-list');
const generateBtn = document.getElementById('generate-btn');
const generatorModal = document.getElementById('generator-modal');
const generatedPassword = document.getElementById('generated-password');
const copyPasswordBtn = document.getElementById('copy-password-btn');
const passwordLength = document.getElementById('password-length');
const lengthValue = document.getElementById('length-value');
const regenerateBtn = document.getElementById('regenerate-btn');
const closeGeneratorBtn = document.getElementById('close-generator-btn');

let allEntries = [];

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
    await api.loadToken();
    
    if (api.token) {
        const validation = await api.validateToken();
        if (validation.success) {
            showMainView(validation.username);
            await loadEntries();
        } else {
            showLoginView();
        }
    } else {
        showLoginView();
    }
});

// Views wechseln
function showLoginView() {
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
}

function showMainView(email) {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    userEmail.textContent = email;
}

// Login
loginBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    
    if (!token) {
        loginError.textContent = 'Bitte Token eingeben';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Verbinde...';
    loginError.textContent = '';

    await api.saveToken(token);
    const validation = await api.validateToken();

    if (validation.success) {
        showMainView(validation.username);
        await loadEntries();
    } else {
        loginError.textContent = validation.message || 'Token ungültig';
        await api.clearToken();
    }

    loginBtn.disabled = false;
    loginBtn.textContent = 'Verbinden';
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await api.clearToken();
    tokenInput.value = '';
    allEntries = [];
    entriesList.innerHTML = '';
    showLoginView();
});

// Einträge laden
async function loadEntries() {
    try {
        // Aktuelle Tab-URL abrufen
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentUrl = tabs[0]?.url || '';

        // Nach URL suchen
        if (currentUrl && !currentUrl.startsWith('chrome://')) {
            const searchResult = await api.searchByUrl(currentUrl);
            if (searchResult.success && searchResult.entries.length > 0) {
                allEntries = searchResult.entries;
                renderEntries(allEntries);
                return;
            }
        }

        // Alle Einträge laden
        const result = await api.getEntries();
        if (result.success) {
            allEntries = result.entries;
            renderEntries(allEntries);
        }
    } catch (error) {
        console.error('Fehler beim Laden:', error);
    }
}

// Einträge rendern
function renderEntries(entries) {
    entriesList.innerHTML = '';

    if (entries.length === 0) {
        entriesList.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Keine Einträge gefunden</p>';
        return;
    }

    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'entry-item';
        item.innerHTML = `
            <div class="entry-icon">🔐</div>
            <div class="entry-info">
                <div class="entry-title">${escapeHtml(entry.title)}</div>
                <div class="entry-username">${escapeHtml(entry.username)}</div>
            </div>
            <div class="entry-actions">
                <button class="icon-btn copy-user" title="Benutzername kopieren">👤</button>
                <button class="icon-btn copy-pass" title="Passwort kopieren">🔑</button>
                <button class="icon-btn fill-form" title="Autofill">✨</button>
            </div>
        `;

        // Event Listeners
        item.querySelector('.copy-user').addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(entry.username);
            showToast('Benutzername kopiert');
        });

        item.querySelector('.copy-pass').addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(entry.password);
            showToast('Passwort kopiert');
        });

        item.querySelector('.fill-form').addEventListener('click', async (e) => {
            e.stopPropagation();
            await autofill(entry);
        });

        entriesList.appendChild(item);
    });
}

// Suche
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allEntries.filter(entry =>
        entry.title.toLowerCase().includes(query) ||
        entry.username.toLowerCase().includes(query) ||
        (entry.url && entry.url.toLowerCase().includes(query))
    );
    renderEntries(filtered);
});

// Autofill
async function autofill(entry) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tabs[0].id, {
        action: 'autofill',
        username: entry.username,
        password: entry.password
    });

    window.close();
}

// Passwort-Generator
generateBtn.addEventListener('click', async () => {
    generatorModal.classList.remove('hidden');
    await generateNewPassword();
});

closeGeneratorBtn.addEventListener('click', () => {
    generatorModal.classList.add('hidden');
});

passwordLength.addEventListener('input', (e) => {
    lengthValue.textContent = e.target.value;
});

regenerateBtn.addEventListener('click', generateNewPassword);

async function generateNewPassword() {
    const options = {
        length: parseInt(passwordLength.value),
        uppercase: document.getElementById('opt-uppercase').checked,
        lowercase: document.getElementById('opt-lowercase').checked,
        numbers: document.getElementById('opt-numbers').checked,
        symbols: document.getElementById('opt-symbols').checked
    };

    try {
        const result = await api.generatePassword(options);
        if (result.success) {
            generatedPassword.value = result.password;
        }
    } catch (error) {
        console.error('Fehler bei Passwort-Generierung:', error);
    }
}

copyPasswordBtn.addEventListener('click', () => {
    copyToClipboard(generatedPassword.value);
    showToast('Passwort kopiert');
});

// Hilfsfunktionen
function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    // Einfache Toast-Benachrichtigung
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #C49C48;
        color: #000;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 1000;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}
```

---

### Content Script für Autofill (content/content.js)

```javascript
// Empfange Autofill-Nachrichten vom Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
        autofillForm(message.username, message.password);
        sendResponse({ success: true });
    }
});

// Formular automatisch ausfüllen
function autofillForm(username, password) {
    // Benutzername-Felder finden
    const usernameSelectors = [
        'input[type="email"]',
        'input[type="text"][name*="user"]',
        'input[type="text"][name*="email"]',
        'input[type="text"][name*="login"]',
        'input[type="text"][id*="user"]',
        'input[type="text"][id*="email"]',
        'input[type="text"][id*="login"]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]'
    ];

    // Passwort-Felder finden
    const passwordSelectors = [
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="new-password"]'
    ];

    // Benutzername ausfüllen
    for (const selector of usernameSelectors) {
        const field = document.querySelector(selector);
        if (field && isVisible(field)) {
            fillField(field, username);
            break;
        }
    }

    // Passwort ausfüllen
    for (const selector of passwordSelectors) {
        const field = document.querySelector(selector);
        if (field && isVisible(field)) {
            fillField(field, password);
            break;
        }
    }
}

// Feld ausfüllen und Events auslösen
function fillField(field, value) {
    field.focus();
    field.value = value;
    
    // Events auslösen, damit die Website die Änderung erkennt
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// Prüfen, ob Element sichtbar ist
function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}
```

---

### Background Service Worker (background/service-worker.js)

```javascript
// Background Service Worker
// Hier können später weitere Funktionen hinzugefügt werden:
// - Benachrichtigungen
// - Automatisches Sperren nach Inaktivität
// - Sync mit Web-App

chrome.runtime.onInstalled.addListener(() => {
    console.log('NoKe Browser-Plugin installiert');
});

// Optional: Badge-Text aktualisieren wenn Einträge für die aktuelle Seite gefunden werden
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        // Hier könnte man prüfen, ob es Einträge für die URL gibt
        // und den Badge entsprechend setzen
    }
});
```

---

## Sicherheitshinweise

### Token-Speicherung

- Tokens werden im `chrome.storage.local` gespeichert
- Tokens sollten NIE im Klartext geloggt werden
- Bei Logout wird das Token aus dem Storage gelöscht

### API-Kommunikation

- Alle API-Anfragen erfolgen über HTTPS
- Tokens werden im Authorization-Header gesendet
- Passwörter werden auf dem Server entschlüsselt und nur über HTTPS übertragen

### Content Security

- Content Scripts haben eingeschränkten Zugriff
- Cross-Origin-Anfragen sind auf die NoKe-API beschränkt

---

## Entwicklung & Testen

### Plugin in Chrome laden

1. Öffne `chrome://extensions/`
2. Aktiviere "Entwicklermodus"
3. Klicke "Entpackte Erweiterung laden"
4. Wähle den Plugin-Ordner

### Debugging

- Popup: Rechtsklick auf Plugin-Icon → "Pop-up untersuchen"
- Service Worker: Auf der Extensions-Seite unter dem Plugin
- Content Script: DevTools der jeweiligen Seite

---

## API-Fehler-Codes

| Code | Bedeutung |
|------|-----------|
| 400 | Ungültige Anfrage / Fehlende Parameter |
| 401 | Token ungültig oder abgelaufen |
| 404 | Ressource nicht gefunden |
| 500 | Server-Fehler |

---

## Kontakt & Support

Bei Fragen zur API oder Integration wende dich an das NoKe-Entwicklungsteam.

---

*Dokumentation Version 1.0 - Erstellt für NoKe Passwort-Manager*

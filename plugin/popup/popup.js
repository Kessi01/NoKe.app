// DOM Elements
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const authorizeBtn = document.getElementById('authorize-btn');
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
let authCheckInterval = null;

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
    await api.loadCredentials();
    
    // Check current auth status
    const validation = await api.validateAuth();
    
    if (validation.success) {
        showMainView(validation.username);
        await loadEntries();
    } else if (validation.requireReauth) {
        showLoginView();
        loginError.style.color = '#ff4444';
        loginError.textContent = 'Autorisierung abgelaufen. Bitte erneut verbinden.';
    } else {
        showLoginView();
    }
});

// Views wechseln
function showLoginView() {
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
    stopAuthCheck();
}

function showMainView(email) {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    userEmail.textContent = email || 'Verbunden';
    stopAuthCheck();
}

// Start periodic auth check after initiating authorization
function startAuthCheck() {
    if (authCheckInterval) return;
    
    authCheckInterval = setInterval(async () => {
        const result = await api.checkAuthorization();
        
        if (result.success && result.authorized) {
            showMainView(result.username);
            await loadEntries();
            showToast('Erfolgreich verbunden!');
        }
    }, 2000);  // Check every 2 seconds
    
    // Stop after 5 minutes
    setTimeout(() => {
        if (authCheckInterval) {
            stopAuthCheck();
            loginError.style.color = '#ff4444';
            loginError.textContent = 'Autorisierung abgelaufen. Bitte erneut versuchen.';
            authorizeBtn.disabled = false;
            authorizeBtn.textContent = '🔐 Mit NoKe verbinden';
        }
    }, 5 * 60 * 1000);
}

function stopAuthCheck() {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }
}

// Authorization - Opens NoKe for automatic authorization
authorizeBtn.addEventListener('click', async () => {
    authorizeBtn.disabled = true;
    authorizeBtn.textContent = 'Öffne NoKe...';
    loginError.textContent = '';

    try {
        const result = await api.authorize();
        
        if (result.waitingForAuth) {
            loginError.style.color = '#C49C48';
            loginError.textContent = '⏳ Bitte autorisiere das Plugin in NoKe...';
            authorizeBtn.textContent = 'Warte auf Autorisierung...';
            
            // Start checking for authorization
            startAuthCheck();
        } else if (result.success) {
            showMainView(api.username);
            await loadEntries();
        }
    } catch (error) {
        loginError.style.color = '#ff4444';
        loginError.textContent = error.message || 'Fehler beim Verbinden';
        authorizeBtn.disabled = false;
        authorizeBtn.textContent = '🔐 Mit NoKe verbinden';
    }
});

// Manual Login with legacy token (Fallback)
loginBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    
    if (!token) {
        loginError.textContent = 'Bitte Token eingeben';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Verbinde...';
    loginError.textContent = '';

    await api.saveLegacyToken(token);
    const validation = await api.validateAuth();

    if (validation.success) {
        showMainView(validation.username);
        await loadEntries();
    } else {
        loginError.style.color = '#ff4444';
        loginError.textContent = validation.message || 'Token ungültig';
        await api.clearCredentials();
    }

    loginBtn.disabled = false;
    loginBtn.textContent = 'Verbinden';
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await api.clearCredentials();
    tokenInput.value = '';
    allEntries = [];
    entriesList.innerHTML = '';
    showLoginView();
    loginError.textContent = '';
});

// Einträge laden
async function loadEntries() {
    try {
        entriesList.innerHTML = '<div class="loading"></div>';
        
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
        entriesList.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Fehler beim Laden der Einträge</p>';
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
        // Use new field names: name (entry name), loginUsername (login username)
        const entryName = entry.name || entry.title || 'Unbenannt';
        const entryUsername = entry.loginUsername || entry.username || '';
        
        item.innerHTML = `
            <div class="entry-icon">🔐</div>
            <div class="entry-info">
                <div class="entry-title">${escapeHtml(entryName)}</div>
                <div class="entry-username">${escapeHtml(entryUsername)}</div>
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
            copyToClipboard(entryUsername);
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
    const filtered = allEntries.filter(entry => {
        const name = (entry.name || entry.title || '').toLowerCase();
        const username = (entry.loginUsername || entry.username || '').toLowerCase();
        const url = (entry.url || '').toLowerCase();
        return name.includes(query) || username.includes(query) || url.includes(query);
    });
    renderEntries(filtered);
});

// Autofill
async function autofill(entry) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tabs[0].id, {
        action: 'autofill',
        username: entry.loginUsername || entry.username || '',
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
        // Fallback: Lokale Generierung
        generatedPassword.value = generateLocalPassword(options);
    }
}

// Lokale Passwort-Generierung als Fallback
function generateLocalPassword(options) {
    let chars = '';
    if (options.uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (options.lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (options.numbers) chars += '0123456789';
    if (options.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    let password = '';
    const array = new Uint32Array(options.length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < options.length; i++) {
        password += chars[array[i] % chars.length];
    }
    
    return password;
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
    // Entferne vorherige Toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    // Einfache Toast-Benachrichtigung
    const toast = document.createElement('div');
    toast.className = 'toast';
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
        animation: fadeIn 0.2s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

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

// Authorization - Opens NoKe and shows manual token input
authorizeBtn.addEventListener('click', async () => {
    authorizeBtn.disabled = true;
    authorizeBtn.textContent = 'Öffne NoKe...';
    loginError.textContent = '';

    try {
        const result = await api.authorize();
        
        if (result.needsManualToken) {
            // Open the manual token section automatically
            const manualTokenDetails = document.querySelector('.manual-token');
            manualTokenDetails.open = true;
            tokenInput.focus();
            loginError.style.color = '#C49C48';
            loginError.textContent = '👆 Kopiere den Token aus NoKe und füge ihn oben ein.';
        } else if (result.success) {
            const validation = await api.validateToken();
            showMainView(validation.username);
            await loadEntries();
        }
    } catch (error) {
        loginError.style.color = '#ff4444';
        loginError.textContent = error.message || 'Fehler beim Öffnen';
    }

    authorizeBtn.disabled = false;
    authorizeBtn.textContent = '🔐 Mit NoKe verbinden';
});

// Manual Login (Fallback)
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

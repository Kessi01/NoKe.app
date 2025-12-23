// NoKe Background Service Worker
// Handles plugin lifecycle, messaging, and background tasks

const API_BASE_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net/api';

// Installation Event
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('NoKe Browser-Plugin installiert', details.reason);
    
    if (details.reason === 'install') {
        // First installation - register plugin
        console.log('Willkommen bei NoKe! Plugin wird registriert...');
        await registerPlugin();
    } else if (details.reason === 'update') {
        // Update
        console.log('NoKe wurde aktualisiert auf Version', chrome.runtime.getManifest().version);
    }
});

/**
 * Register plugin with the NoKe server
 * Creates unique plugin ID and secret
 */
async function registerPlugin() {
    try {
        const result = await chrome.storage.local.get(['pluginId', 'pluginSecret']);
        
        // Already registered
        if (result.pluginId && result.pluginSecret) {
            console.log('Plugin bereits registriert:', result.pluginId);
            return;
        }

        // Register new plugin
        const response = await fetch(`${API_BASE_URL}/plugin-auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            await chrome.storage.local.set({
                pluginId: data.pluginId,
                pluginSecret: data.pluginSecret,
                authorized: false
            });
            console.log('Plugin registriert:', data.pluginId);
        } else {
            console.error('Plugin-Registrierung fehlgeschlagen:', data.message);
        }
    } catch (error) {
        console.error('Fehler bei Plugin-Registrierung:', error);
    }
}

// Tab-Update Listener - Badge aktualisieren wenn passende Einträge gefunden werden
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        try {
            const result = await chrome.storage.local.get(['rollingKey', 'authorized']);
            if (result.authorized && result.rollingKey) {
                // Could show badge with matching entries count
                // await chrome.action.setBadgeText({ tabId, text: '' });
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Badges:', error);
        }
    }
});

// Aktives Tab wechseln - Badge aktualisieren
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && !tab.url.startsWith('chrome://')) {
            // Badge-Logik hier
        }
    } catch (error) {
        // Tab may have been closed
    }
});

// Keyboard Shortcuts (optional)
chrome.commands?.onCommand.addListener((command) => {
    if (command === 'open-popup') {
        // Popup öffnen (falls definiert in manifest.json commands)
    } else if (command === 'autofill-current') {
        // Autofill für aktuelle Seite (falls definiert)
    }
});

// Context Menu erstellen (optional - für Rechtsklick-Menü)
chrome.runtime.onInstalled.addListener(() => {
    // Context Menu für Passwort-Felder
    chrome.contextMenus?.create({
        id: 'noke-autofill',
        title: '🔐 Mit NoKe ausfüllen',
        contexts: ['editable']
    });
});

// Context Menu Click Handler
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'noke-autofill') {
        // Öffne das Popup oder führe Autofill durch
        chrome.action.openPopup();
    }
});

// Message Handler für Kommunikation zwischen Content Script und Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getCredentials') {
        chrome.storage.local.get(['pluginId', 'rollingKey', 'authorized', 'username'], (result) => {
            sendResponse({
                pluginId: result.pluginId,
                rollingKey: result.rollingKey,
                authorized: result.authorized,
                username: result.username
            });
        });
        return true; // Async response
    }
    
    if (message.action === 'updateRollingKey') {
        // Update rolling key after API request
        chrome.storage.local.set({ rollingKey: message.newKey }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (message.action === 'checkUrl') {
        // URL-basierte Suche durchführen
        sendResponse({ success: true });
        return true;
    }
});

console.log('NoKe Service Worker gestartet');

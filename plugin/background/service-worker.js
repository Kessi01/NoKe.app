// NoKe Background Service Worker
// Hier werden zentrale Funktionen für das Plugin verwaltet

// Installation Event
chrome.runtime.onInstalled.addListener((details) => {
    console.log('NoKe Browser-Plugin installiert', details.reason);
    
    if (details.reason === 'install') {
        // Erste Installation
        console.log('Willkommen bei NoKe!');
    } else if (details.reason === 'update') {
        // Update
        console.log('NoKe wurde aktualisiert auf Version', chrome.runtime.getManifest().version);
    }
});

// Tab-Update Listener - Badge aktualisieren wenn passende Einträge gefunden werden
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        // Hier könnte man prüfen, ob es Einträge für die URL gibt
        // und den Badge entsprechend setzen
        try {
            const result = await chrome.storage.local.get(['apiToken']);
            if (result.apiToken) {
                // Badge zurücksetzen (optional: Anzahl passender Einträge anzeigen)
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
        console.error('Fehler beim Tab-Wechsel:', error);
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
    if (message.action === 'getToken') {
        chrome.storage.local.get(['apiToken'], (result) => {
            sendResponse({ token: result.apiToken });
        });
        return true; // Async response
    }
    
    if (message.action === 'checkUrl') {
        // URL-basierte Suche durchführen
        sendResponse({ success: true });
        return true;
    }
});

console.log('NoKe Service Worker gestartet');

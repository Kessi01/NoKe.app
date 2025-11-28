const { CosmosClient } = require("@azure/cosmos");

// Azure zieht diesen Wert automatisch aus den Umgebungsvariablen
const connectionString = process.env.COSMOS_CONNECTION_STRING;

console.log("🔧 DB Modul wird geladen...");
console.log("🔍 Connection String vorhanden?", !!connectionString);
if (connectionString) {
    console.log("📏 Connection String Länge:", connectionString.length);
}

let container = null;

if (connectionString) {
    try {
        console.log("🔌 Erstelle CosmosClient...");
        const client = new CosmosClient(connectionString);
        console.log("✅ CosmosClient erstellt");
        
        // Datenbank und Container Namen müssen exakt so in Azure erstellt werden
        console.log("📁 Zugriff auf Datenbank 'NokeDB'...");
        const database = client.database("NokeDB");
        console.log("📦 Zugriff auf Container 'Items'...");
        container = database.container("Items");
        
        console.log("✅ DB Verbindung (Client) erfolgreich initialisiert.");
        console.log("📊 Container Objekt:", typeof container);
    } catch (error) {
        console.error("❌ DB Verbindung fehlgeschlagen (Fehler bei Initialisierung):", error.message);
        console.error("❌ Stack Trace:", error.stack);
    }
} else {
    console.error("❌ DB Verbindung fehlgeschlagen: Kein 'COSMOS_CONNECTION_STRING' gefunden.");
    console.error("🔍 Verfügbare Environment Variables:", Object.keys(process.env).filter(k => k.includes('COSMOS') || k.includes('AZURE')));
}

module.exports = { container };

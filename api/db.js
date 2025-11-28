const { CosmosClient } = require("@azure/cosmos");

// Azure zieht diesen Wert automatisch aus den Umgebungsvariablen
const connectionString = process.env.COSMOS_CONNECTION_STRING;

let container = null;

if (connectionString) {
    try {
        const client = new CosmosClient(connectionString);
        // Datenbank und Container Namen müssen exakt so in Azure erstellt werden
        const database = client.database("NokeDB");
        container = database.container("Items");
        
        console.log("✅ DB Verbindung (Client) erfolgreich initialisiert.");
    } catch (error) {
        console.error("❌ DB Verbindung fehlgeschlagen (Fehler bei Initialisierung):", error.message);
    }
} else {
    console.error("❌ DB Verbindung fehlgeschlagen: Kein 'COSMOS_CONNECTION_STRING' gefunden.");
}

module.exports = { container };

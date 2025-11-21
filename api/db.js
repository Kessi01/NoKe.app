const { CosmosClient } = require("@azure/cosmos");
 
// Azure zieht diesen Wert automatisch aus den Umgebungsvariablen
const connectionString = process.env.COSMOS_CONNECTION_STRING;
 
let container = null;
 
if (connectionString) {
    const client = new CosmosClient(connectionString);
    // Datenbank und Container Namen müssen exakt so in Azure erstellt werden
    const database = client.database("NokeDB");
    container = database.container("Items");
}
 
module.exports = { container };
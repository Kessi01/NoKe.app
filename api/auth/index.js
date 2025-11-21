const { container } = require('../db');
const bcrypt = require('bcryptjs');
 
module.exports = async function (context, req) {
    const { action, username, password } = req.body;
 
    if (!container) {
        context.res = { status: 500, body: { success: false, message: "Datenbank-Verbindung fehlt" } };
        return;
    }
 
    try {
        const querySpec = {
            query: "SELECT * FROM c WHERE c.username = @u AND c.type = 'user'",
            parameters: [{ name: "@u", value: username }]
        };
        const { resources } = await container.items.query(querySpec).fetchAll();
 
        if (action === 'register') {
            if (resources.length > 0) {
                context.res = { body: { success: false, message: "Benutzername vergeben" } };
                return;
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await container.items.create({ 
                id: username + "_profile", 
                username, 
                password: hashedPassword, 
                type: "user" 
            });
            context.res = { body: { success: true } };
 
        } else if (action === 'login') {
            if (resources.length === 0) {
                context.res = { body: { success: false, message: "Benutzer nicht gefunden" } };
                return;
            }
            const valid = await bcrypt.compare(password, resources[0].password);
            if (!valid) {
                context.res = { body: { success: false, message: "Falsches Passwort" } };
                return;
            }
            context.res = { body: { success: true, username } };
        }
    } catch (error) {
        context.log(error);
        context.res = { status: 500, body: { success: false, message: "Serverfehler" } };
    }
};
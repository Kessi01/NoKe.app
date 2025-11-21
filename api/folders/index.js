const { container } = require('../db');

module.exports = async function (context, req) {
    // FIX: Sicherheitscheck
    if (!container) {
        context.res = {
            status: 500,
            body: { success: false, message: "Keine Datenbankverbindung." }
        };
        return;
    }

    const method = req.method.toLowerCase();
    const { username, folderName } = req.body;

    if (method === 'post') {
        try {
            await container.items.create({
                id: `folder_${username}_${folderName}`,
                username, 
                folderName, 
                type: 'folder'
            });
            context.res = { body: { success: true } };
        } catch (e) {
            context.log.error(e);
            // 409 Conflict abfangen (Ordner existiert schon)
            context.res = { 
                status: e.code === 409 ? 409 : 500, 
                body: { success: false, message: e.message } 
            };
        }
    }

    if (method === 'delete') {
        try {
            await container.item(`folder_${username}_${folderName}`, username).delete();
            context.res = { body: { success: true } };
        } catch(e) {
            context.log.error(e);
            context.res = { status: 500, body: { success: false } };
        }
    }
};

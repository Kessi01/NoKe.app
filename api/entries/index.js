const { container } = require('../db');
 
module.exports = async function (context, req) {
    const method = req.method.toLowerCase();
    if (method === 'post') {
        const entry = req.body;
        if (!entry.id) entry.id = Math.random().toString(36).substring(2, 15);
        entry.type = 'entry';
        entry.username = entry.user; // Wichtig für Partition Key
        await container.items.upsert(entry);
        context.res = { body: { success: true } };
    }
    if (method === 'delete') {
        const { id, username } = req.body;
        try {
            await container.item(id, username).delete();
            context.res = { body: { success: true } };
        } catch(e) {
            context.res = { body: { success: false } };
        }
    }
};
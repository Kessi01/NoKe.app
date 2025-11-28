const { container } = require('../db');

module.exports = async function (context, req) {
    const username = req.query.username;
    if (!container || !username) {
        context.res = { body: { folders: [], entries: [] } };
        return;
    }

    try {
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.username = @u",
            parameters: [{ name: "@u", value: username }]
        }).fetchAll();

        const folders = resources.filter(i => i.type === 'folder').map(f => f.folderName);

        const { decrypt } = require('../shared/crypto');
        const entries = resources.filter(i => i.type === 'entry').map(entry => {
            if (entry.password) {
                entry.password = decrypt(entry.password);
            }
            return entry;
        });

        context.res = { body: { folders, entries } };
    } catch (e) {
        context.res = { status: 500, body: e.message };
    }
};
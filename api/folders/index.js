const { container } = require('../db');
 
module.exports = async function (context, req) {
    const method = req.method.toLowerCase();
    const { username, folderName } = req.body;
 
    if (method === 'post') {
        await container.items.create({
            id: `folder_${username}_${folderName}`,
            username, folderName, type: 'folder'
        });
        context.res = { body: { success: true } };
    }
 
    if (method === 'delete') {
        try {
            await container.item(`folder_${username}_${folderName}`, username).delete();
            context.res = { body: { success: true } };
        } catch(e) {
            context.res = { body: { success: false } };
        }
    }
};
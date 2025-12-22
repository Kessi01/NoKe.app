const crypto = require('crypto');

// Fallback Key für Entwicklung (NICHT IN PRODUKTION NUTZEN!)
// In Azure Function App Settings: ENCRYPTION_KEY setzen (32 Zeichen)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '1234567890123456789012345678'; // 32 chars
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error("Encryption error:", error);
        return text; // Fallback: return original (or throw)
    }
}

function decrypt(text) {
    if (!text) return text;
    try {
        const textParts = text.split(':');
        // Check format: iv:content
        if (textParts.length !== 2) {
            // Not encrypted or old format
            return text;
        }

        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // If decryption fails (e.g. wrong key or not encrypted), return original text
        // This ensures backward compatibility with plain text passwords
        // console.warn("Decryption failed, returning original text:", error.message);
        return text;
    }
}

module.exports = { encrypt, decrypt };

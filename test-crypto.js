const { encrypt, decrypt } = require('./api/shared/crypto');

console.log("🧪 Testing Crypto Module...");

const original = "SuperSecretPassword123!";
console.log("📝 Original:", original);

const encrypted = encrypt(original);
console.log("🔒 Encrypted:", encrypted);

if (encrypted === original) {
    console.error("❌ Encryption failed: Output matches input");
    process.exit(1);
}

const decrypted = decrypt(encrypted);
console.log("🔓 Decrypted:", decrypted);

if (decrypted !== original) {
    console.error("❌ Decryption failed: Output does not match input");
    process.exit(1);
}

console.log("✅ Encryption/Decryption cycle successful!");

// Test backward compatibility
const plainText = "OldPasswordNotEncrypted";
const decryptedPlain = decrypt(plainText);
console.log("Testing backward compatibility...");
if (decryptedPlain === plainText) {
    console.log("✅ Backward compatibility successful (returned original text)");
} else {
    console.error("❌ Backward compatibility failed");
}

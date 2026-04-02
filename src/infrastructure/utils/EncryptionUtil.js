// src/infrastructure/security/EncryptionUtil.js
const crypto = require('crypto');

// Setup AES-256-CBC requirements (Key must be exactly 32 bytes)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

class EncryptionUtil {

    /**
     * Encrypts plain text using AES-256-CBC.
     * Generates a random Initialization Vector (IV) to ensure the same text encrypts differently every time.
     * @param {string} text - The sensitive data to encrypt (e.g., OAuth tokens).
     * @returns {string|null} The encrypted string formatted as 'iv_hex:encryptedText_hex'.
     */
    static encrypt(text) {
        if (!text) return null;

        // 1. Generate a random 16-byte IV
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

        // 2. Encrypt the payload
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        // 3. Return a single string combining IV and Ciphertext (separated by colon)
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    /**
     * Decrypts a previously encrypted string back to its original plain text.
     * @param {string} text - The encrypted string formatted as 'iv_hex:encryptedText_hex'.
     * @returns {string|null} The decrypted original text.
     */
    static decrypt(text) {
        if (!text) return null;

        // 1. Split the string to recover the exact IV used during encryption
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');

        // 2. Decrypt the payload
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString();
    }
}

module.exports = EncryptionUtil;
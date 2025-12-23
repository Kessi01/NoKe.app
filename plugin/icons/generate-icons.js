/**
 * Icon Generator Script für NoKe Browser Plugin
 * 
 * Verwendung:
 * 1. Node.js installieren
 * 2. npm install canvas
 * 3. node generate-icons.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];

function drawIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const scale = size / 128;
    
    // Clear with transparent background
    ctx.clearRect(0, 0, size, size);
    
    // Background circle (dark)
    ctx.beginPath();
    ctx.arc(64 * scale, 64 * scale, 60 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    
    // Gold circle
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#D4A84E');
    gradient.addColorStop(1, '#C49C48');
    
    ctx.beginPath();
    ctx.arc(64 * scale, 64 * scale, 56 * scale, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Lock body (dark rectangle)
    ctx.beginPath();
    ctx.roundRect(40 * scale, 56 * scale, 48 * scale, 40 * scale, 6 * scale);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    
    // Lock shackle (arc)
    ctx.beginPath();
    ctx.arc(64 * scale, 44 * scale, 16 * scale, Math.PI, 0, false);
    ctx.lineWidth = 8 * scale;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Keyhole circle
    ctx.beginPath();
    ctx.arc(64 * scale, 72 * scale, 6 * scale, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Keyhole rectangle
    ctx.beginPath();
    ctx.roundRect(61 * scale, 72 * scale, 6 * scale, 12 * scale, 2 * scale);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    return canvas;
}

// Generate icons
sizes.forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    const filename = path.join(__dirname, `icon${size}.png`);
    fs.writeFileSync(filename, buffer);
    console.log(`Generated: icon${size}.png`);
});

console.log('\nAll icons generated successfully!');

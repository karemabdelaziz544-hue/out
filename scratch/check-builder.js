const fs = require('fs');

// Read the journey builder source
const code = fs.readFileSync('src/lib/shipments/journey-builder.ts', 'utf8');

// Strip TypeScript annotations using a simple node evaluation or compile with esbuild if available, or just inspect code
console.log('Journey builder exists and is', code.length, 'bytes');

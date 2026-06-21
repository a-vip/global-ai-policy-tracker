const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/AI_Workspace/Obsidian/Avi/global-ai-policy-tracker/public/data/unified-regulations.json'));
const o = data.filter(d => d.lat != null);
fs.writeFileSync('markers.txt', o.map(d => `${d.title}: ${d.lat}, ${d.lon}`).join('\n'));

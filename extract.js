const fs = require('fs');
const content = fs.readFileSync('meshy.html', 'utf8');
const matches = content.match(/https:\/\/[^"']+\.glb/gi);
if (matches) {
    console.log("Found GLB URLs:");
    [...new Set(matches)].forEach(m => console.log(m));
} else {
    console.log("No GLB URLs found.");
}

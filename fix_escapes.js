const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('c:/Users/Le221/Downloads/KRUSMART/krusmart-nextjs/app/(main)', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    content = content.replace(/\\`/g, '`');
    content = content.replace(/\\\$/g, '$');
    
    if (filePath.includes('IdStudentClient')) {
      content = content.replace(/\\\\s/g, '\\s');
      content = content.replace(/\\\\/g, '\\');
      content = content.replace(/\\n/g, '\\n');
    }

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', filePath);
    }
  }
});

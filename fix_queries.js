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
  if (filePath.endsWith('page.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    let original = content;
    // We match from .from('students') to just before the next statement
    content = content.replace(/\.from\('students'\)[\s\S]*?(?=\n\s*(?:if\s*\(|let\s*\{|const\s*\{|return|\}))/g, 
        ".from('students')\n    .select('*')\n    .eq('teacher_id', user.id)\n    .order('order_index', { ascending: true, nullsFirst: false })\n    .order('created_at', { ascending: true })");
    
    if (original !== content) {
      fs.writeFileSync(filePath, content);
      console.log('Updated: ' + filePath);
    }
  }
});

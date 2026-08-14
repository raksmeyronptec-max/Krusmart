const fs = require('fs');
const path = require('path');

const introDir = 'C:\\Users\\Le221\\Downloads\\KRUSMART\\krusmart-nextjs\\public\\introduction';

const replacements = {
    'href="/attendance"': 'href="/attendance/monthly"',
    'href="/homework"': 'href="/homework/enter"',
    'href="/score"': 'href="/score/enter"',
    'href="/subject-scores"': 'href="/score/total"',
    'href="/score_analyse"': 'href="/score-analyse"',
    'href="/adr"': 'href="/administration"',
    'href="/admin"': 'href="/administration"',
    'href="/student-codes"': 'href="/print-student-codes"',
    'href="/years_score"': 'href="/yearly-report"',
    'href="/cleaning_schedule"': 'href="/cleaning-schedule"',
    'href="/id_student"': 'href="/id-student"',
    'href="/student_age_list"': 'href="/print-student-age"',
    'href="/teacher-notifications"': 'href="/notifications"',
    'href="/student_tracking"': 'href="/student-tracking"'
};

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            for (const [oldHref, newHref] of Object.entries(replacements)) {
                if (content.includes(oldHref)) {
                    // Global replace just in case
                    content = content.split(oldHref).join(newHref);
                    modified = true;
                }
            }
            
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

processDirectory(introDir);
console.log('Finished updating links!');

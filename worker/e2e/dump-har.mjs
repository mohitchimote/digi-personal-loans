import fs from 'fs';
const harPath = 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\capture.har';
const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
console.log('total entries:', har.log.entries.length);
for (const e of har.log.entries) {
  console.log(e.startedDateTime, e.time.toFixed(0) + 'ms', e.response.status, e.request.method, e.request.url.replace('https://is.personalloans.tcsdigilend.com', ''));
}

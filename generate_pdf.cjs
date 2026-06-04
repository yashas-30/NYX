const fs = require('fs');
const https = require('https');

const markdown = fs.readFileSync('nyx_audit.md', 'utf8');

const req = https.request({
  hostname: 'md-to-pdf.fly.dev',
  port: 443,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}, (res) => {
  if (res.statusCode !== 200) {
    console.error('Error:', res.statusCode);
    return;
  }
  const file = fs.createWriteStream('nyx_audit.pdf');
  res.pipe(file);
  file.on('finish', () => {
    console.log('PDF generated successfully!');
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write('markdown=' + encodeURIComponent(markdown));
req.end();

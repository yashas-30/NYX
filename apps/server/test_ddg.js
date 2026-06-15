const fetch = require('node-fetch'); // or global fetch
const cheerio = require('cheerio');

fetch('https://html.duckduckgo.com/html/?q=winner+of+2026+Formula+1+Spanish+Grand+Prix+Barcelona', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
})
.then(r => r.text())
.then(html => {
  const $ = cheerio.load(html);
  console.log('results count:', $('.result').length);
  console.log('titles:', $('.result__title').length);
  console.log('snippets:', $('.result__snippet').length);
  console.log('urls:', $('.result__url').length);
  
  if ($('.result').length === 0) {
      console.log('Did not find .result. HTML length:', html.length);
      console.log('Checking for captcha or redirect:');
      if (html.includes('captcha') || html.includes('Redirect')) console.log('CAPTCHA / REDIRECT');
  }
});

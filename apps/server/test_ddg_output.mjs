import * as cheerio from 'cheerio';

fetch('https://html.duckduckgo.com/html/?q=winner+of+2026+Formula+1+Spanish+Grand+Prix+Barcelona', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
})
.then(r => r.text())
.then(html => {
  const $ = cheerio.load(html);
  
  $('.result').each((i, el) => {
      if(i === 0) {
          console.log('Title:', $(el).find('.result__title').text().trim());
          console.log('Snippet:', $(el).find('.result__snippet').text().trim());
      }
  });
});

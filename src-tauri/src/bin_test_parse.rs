use scraper::{Html, Selector};
fn main() {
    let html = std::fs::read_to_string("e:/NYX/ddg_out.html").unwrap();
    let document = Html::parse_document(&html);
    let result_sel = Selector::parse("div.result, div.web-result, div[class*=\"result\"]").unwrap();
    let title_sel = Selector::parse("a.result__a, h2.result__title a, a[class*=\"result__a\"]").unwrap();
    let snippet_sel = Selector::parse("a.result__snippet, div.result__snippet, span.result__snippet, [class*=\"snippet\"]").unwrap();
    
    let mut results = Vec::new();
    for result_el in document.select(&result_sel) {
        let title_el = result_el.select(&title_sel).next();
        let snippet_el = result_el.select(&snippet_sel).next();
        
        let title: String = title_el.map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string()).unwrap_or_default();
        let raw_href = title_el.and_then(|e| e.value().attr("href")).unwrap_or("");
        let snippet: String = snippet_el.map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string()).unwrap_or_default();
        
        println!("Title: {}", title);
        println!("URL: {}", raw_href);
        println!("Snippet: {}", snippet);
        println!("---");
        
        if !title.is_empty() && !raw_href.is_empty() {
            results.push((title, raw_href.to_string(), snippet));
        }
    }
    println!("Found {} results", results.len());
}

use rusqlite::Connection;

fn main() {
    let conn = Connection::open_in_memory().unwrap();
    sqlite_vec::sqlite3_vec_init(&conn).unwrap();
    let res: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).unwrap();
    println!("sqlite version: {}", res);
    
    // test json array parsing
    let res: Result<Vec<f32>, _> = conn.query_row("SELECT vec_to_json(vec0('[0.1, 0.2]'))", [], |r| r.get(0));
    println!("res: {:?}", res);
}

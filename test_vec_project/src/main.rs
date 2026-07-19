use sqlx::{SqlitePool, Row};
use rusqlite::ffi::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;

#[tokio::main]
async fn main() {
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    }
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    let res: String = sqlx::query("select vec_version()")
        .fetch_one(&pool)
        .await.unwrap()
        .get(0);
    println!("vec_version in sqlx: {}", res);
}

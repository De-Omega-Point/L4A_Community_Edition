use std::{fs::{self, OpenOptions}, io::{Read, Write}, path::Path};
pub const MAX_BYTES: usize = 20 * 1024 * 1024;
pub const CSV_HEADER: &str = "\"Name\",\"Customer Code\",\"Email\",\"Phone\",\"Contact Consent\",\"Visits\",\"Points\",\"Tier\",\"Created\"";

pub fn extension(filename: &str) -> Option<&'static str> {
    if filename.is_empty() || filename.len() > 180 || filename.starts_with('.') || filename.ends_with('.') || filename.ends_with(' ')
        || filename.chars().any(|c| c.is_control() || "\\/:*?\"<>|".contains(c)) { return None; }
    let stem = filename.split('.').next()?.trim_end().to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL", "CLOCK$"].contains(&stem.as_str()) || ((stem.starts_with("COM") || stem.starts_with("LPT")) && matches!(stem.get(3..), Some("0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"))) { return None; }
    if filename.ends_with(".json") { Some("json") } else if filename.ends_with(".csv") { Some("csv") } else { None }
}
pub fn validate(filename: &str, text: &str, mime: &str) -> Result<&'static str, &'static str> {
    if text.is_empty() || text.len() > MAX_BYTES || text.contains('\0') { return Err("Export exceeds the limit or is empty"); }
    match extension(filename) {
        Some("json") if mime == "application/json" => {
            let value: serde_json::Value = serde_json::from_str(text).map_err(|_| "Invalid backup JSON")?;
            if value["schemaVersion"] != 7 || value["edition"] != "community" || value["storageModel"] != "local-first"
                || !value["customers"].is_array() || !value["activity"].is_array() || !value["branding"].is_object() {
                return Err("Not a Community Edition backup");
            }
            Ok("json")
        }
        Some("csv") if mime == "text/csv;charset=utf-8" && (text == CSV_HEADER || text.starts_with(&format!("{CSV_HEADER}\r\n"))) => Ok("csv"),
        _ => Err("Unsupported export format"),
    }
}
// Destination comes only from the native Save As dialog, never from the page.
// create_new is atomic: even a race with another writer cannot overwrite a file.
pub fn save_new_verified(path: &Path, text: &str, ext: &str) -> Result<(), String> {
    if !path.is_absolute() || path.file_name().and_then(|n| n.to_str()).and_then(extension) != Some(ext) { return Err("Choose a new file with the correct extension".into()); }
    if text.len() > MAX_BYTES { return Err("Export exceeds 20 MB".into()); }
    let mut options = OpenOptions::new();
    options.write(true).read(true).create_new(true);
    #[cfg(target_os = "windows")]
    { use std::os::windows::fs::OpenOptionsExt; options.share_mode(0); }
    let mut file = options.open(path).map_err(|_| "File exists or destination is unavailable".to_string())?;
    let result = (|| {
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::Start(0))?;
        let mut bytes = Vec::with_capacity(text.len());
        (&mut file).take((MAX_BYTES + 1) as u64).read_to_end(&mut bytes)?;
        if bytes != text.as_bytes() { return Err(std::io::Error::other("Saved bytes did not match")); }
        Ok(())
    })();
    drop(file);
    // Do not unlink by path after closing: another process could replace it.
    // An interrupted write may leave an incomplete file; the UI never calls it a backup.
    result.map_err(|_| "Could not verify saved file; do not treat it as a backup".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    const BACKUP: &str = r#"{"schemaVersion":7,"edition":"community","storageModel":"local-first","customers":[],"activity":[],"branding":{}}"#;
    #[test] fn formats_and_limits_fail_closed() {
        assert_eq!(validate("backup.json", BACKUP, "application/json"), Ok("json"));
        assert_eq!(validate("customers.csv", CSV_HEADER, "text/csv;charset=utf-8"), Ok("csv"));
        for name in ["../x.json", "x.json.exe", "CON.json", "NUL.csv", "COM1.json", "x:y.json", ".json", "x.json ", "COM¹.json", "LPT².csv", "CON .json"] { assert!(extension(name).is_none(), "{name}"); }
        assert!(validate("x.json", "{}", "application/json").is_err());
        assert!(validate("x.csv", "=1+1", "text/csv;charset=utf-8").is_err());
        assert!(validate("x.json", &"x".repeat(MAX_BYTES+1), "application/json").is_err());
    }
    #[test] fn exact_bytes_no_overwrite_and_failed_destination() {
        let dir = std::env::temp_dir().join(format!("l4a-export-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("backup.json");
        save_new_verified(&path, BACKUP, "json").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), BACKUP);
        assert!(save_new_verified(&path, "replacement", "json").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), BACKUP);
        assert!(save_new_verified(&dir.join("missing").join("backup.json"), BACKUP, "json").is_err());
        assert!(save_new_verified(&dir.join("backup.exe"), BACKUP, "json").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}

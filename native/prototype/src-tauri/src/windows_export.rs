//! Windows-only, content-only export transport. No page-supplied file paths.
use std::{path::PathBuf, sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}}, time::{Duration, Instant}};
use tauri::{Runtime, Webview};
use crate::export_policy;

#[cfg(feature = "export-smoke")]
fn diagnostic(fixture: bool, value: serde_json::Value) {
    if !fixture { return; }
    if let Ok(report) = std::env::var("L4A_EXPORT_SMOKE_REPORT") {
        use std::io::Write;
        let path = std::path::PathBuf::from(report).with_extension("native-log");
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", value);
        }
    }
}

#[derive(Default)]
pub struct ExportState { pub busy: AtomicBool, pub generation: AtomicU64 }
fn hosted(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(crate::HOST) && url.port_or_known_default() == Some(443)
        && url.username().is_empty() && url.password().is_none()
}
fn current<R: Runtime>(view: &Webview<R>, origin: &tauri::Url, state: &ExportState, generation: u64) -> bool {
    state.generation.load(Ordering::SeqCst) == generation && view.url().is_ok_and(|u| u == *origin)
}
fn finish<R: Runtime>(view: &Webview<R>, url: &str, token: &str, status: &str) {
    let args = serde_json::json!([url, token, status]);
    let _ = view.eval(format!("window.__L4A_EXPORT_MAILBOX_V1__?.complete(...{args});"));
}
fn choose_path(filename: &str, extension: &str) -> Result<Option<PathBuf>, ()> {
    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let mut file = vec![0u16; 32768];
    let initial: Vec<u16> = filename.encode_utf16().collect();
    file[..initial.len()].copy_from_slice(&initial);
    let title: Vec<u16> = "Save a NEW L4A export file (existing files are never replaced)\0".encode_utf16().collect();
    let filter: Vec<u16> = format!("L4A {extension} export\0*.{extension}\0\0").encode_utf16().collect();
    let ext: Vec<u16> = format!("{extension}\0").encode_utf16().collect();
    // All backing buffers stay alive until this synchronous OS dialog returns.
    let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    dialog.lpstrFile = file.as_mut_ptr(); dialog.nMaxFile = file.len() as u32;
    dialog.lpstrTitle = title.as_ptr(); dialog.lpstrFilter = filter.as_ptr(); dialog.lpstrDefExt = ext.as_ptr();
    dialog.Flags = OFN_EXPLORER | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_NOREADONLYRETURN;
    if unsafe { GetSaveFileNameW(&mut dialog) } == 0 {
        return if unsafe { CommDlgExtendedError() } == 0 { Ok(None) } else { Err(()) };
    }
    let end = file.iter().position(|&c| c == 0).ok_or(())?;
    let value = String::from_utf16(&file[..end]).map_err(|_| ())?;
    // Do not permit device namespaces, UNC/network destinations or NTFS ADS.
    if value.starts_with("\\\\") || value.chars().skip(2).any(|c| c == ':') { return Err(()); }
    Ok(Some(PathBuf::from(value)))
}

pub fn requested<R: Runtime>(view: Webview<R>, url: tauri::Url, state: Arc<ExportState>) {
    requested_inner(view, url, state, false);
}
#[cfg(feature = "export-smoke")]
pub fn requested_fixture<R: Runtime>(view: Webview<R>, url: tauri::Url, state: Arc<ExportState>) {
    requested_inner(view, url, state, true);
}
fn requested_inner<R: Runtime>(view: Webview<R>, url: tauri::Url, state: Arc<ExportState>, fixture: bool) {
    let Ok(origin) = view.url() else { return; };
    #[cfg(feature = "export-smoke")]
    diagnostic(fixture, serde_json::json!({"phase":"requested", "origin":origin.as_str(), "url":url.as_str(), "busy":state.busy.load(Ordering::SeqCst)}));
    let mut permitted = hosted(&origin);
    #[cfg(feature = "export-smoke")]
    { permitted |= fixture && ((origin.scheme() == "http" && origin.host_str() == Some("tauri.localhost") && origin.port().is_none()) || (origin.scheme() == "tauri" && origin.host_str() == Some("localhost"))); }
    #[cfg(not(feature = "export-smoke"))]
    let _ = fixture;
    if !permitted || url.scheme() != "blob" || url.origin() != origin.origin() { return; }
    if state.busy.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        let busy_view = view.clone(); let busy_url = url.clone(); let busy_origin = origin.clone();
        let script = format!("window.__L4A_EXPORT_MAILBOX_V1__?.take({}) ?? null", serde_json::to_string(url.as_str()).unwrap());
        let _ = view.eval_with_callback(script, move |response| {
            // Only settle the new matching request; do not clear or alter the first job.
            if response.len() > export_policy::MAX_BYTES * 6 + 4096 || !busy_view.url().is_ok_and(|u| u == busy_origin) { return; }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&response) {
                if let Some(token) = value["token"].as_str().filter(|t| t.len() == 36) {
                    finish(&busy_view, busy_url.as_str(), token, "busy");
                }
            }
        });
        return;
    }
    let generation = state.generation.load(Ordering::SeqCst);
    let requested_at = Instant::now();
    let args = serde_json::to_string(url.as_str()).unwrap();
    let script = format!("window.__L4A_EXPORT_MAILBOX_V1__?.take({args}) ?? null");
    let callback_view = view.clone();
    let callback_state = state.clone();
    let called = Arc::new(AtomicBool::new(false));
    let once = called.clone();
    let result = view.eval_with_callback(script, move |response| {
        if once.swap(true, Ordering::SeqCst) { return; }
        let view = callback_view.clone(); let state = callback_state.clone(); let url = url.clone(); let origin = origin.clone();
        std::thread::spawn(move || {
            struct Release(Arc<ExportState>); impl Drop for Release { fn drop(&mut self) { self.0.busy.store(false, Ordering::SeqCst); } }
            let _release = Release(state.clone());
            if !current(&view, &origin, &state, generation) || requested_at.elapsed() > Duration::from_secs(110) { return; }
            // JSON escaping may expand the 20 MB text transport by up to six times.
            if response.len() > export_policy::MAX_BYTES * 6 + 4096 { return; }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&response) else { return; };
            let (Some(token), Some(filename), Some(text), Some(mime)) = (value["token"].as_str(), value["filename"].as_str(), value["text"].as_str(), value["type"].as_str()) else { return; };
            if token.len() != 36 || !token.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return; }
            let Ok(ext) = export_policy::validate(filename, text, mime) else { finish(&view, url.as_str(), token, "failed"); return; };
            #[cfg(feature = "export-smoke")]
            diagnostic(fixture, serde_json::json!({"phase":"dialog-open", "generation":generation}));
            let status = match choose_path(filename, ext) {
                Ok(None) => "cancelled",
                Err(()) => "failed",
                Ok(Some(path)) => {
                    #[cfg(feature = "export-smoke")]
                    if fixture {
                        // Synthetic harness diagnostic only; never sent to the page
                        // and not compiled into the ordinary MSI.
                        if let Ok(report) = std::env::var("L4A_EXPORT_SMOKE_REPORT") {
                            use std::io::Write;
                            let output = std::path::PathBuf::from(report).with_extension("selected");
                            if let Ok(mut file) = std::fs::OpenOptions::new().write(true).create_new(true).open(output) {
                                let _ = file.write_all(path.to_string_lossy().as_bytes());
                            }
                        }
                    }
                    if !current(&view, &origin, &state, generation) || requested_at.elapsed() > Duration::from_secs(110) { "unconfirmed" }
                    else if export_policy::save_new_verified(&path, text, ext).is_ok() { "saved" } else { "failed" }
                }
            };
            #[cfg(feature = "export-smoke")]
            diagnostic(fixture, serde_json::json!({"phase":"dialog-finished", "status":status,"current":current(&view,&origin,&state,generation),"generation":generation,"nowGeneration":state.generation.load(Ordering::SeqCst),"elapsedMs":requested_at.elapsed().as_millis(),"nowUrl":view.url().ok().map(|u|u.to_string())}));
            if current(&view, &origin, &state, generation) {
                finish(&view, url.as_str(), token, status);
                #[cfg(feature = "export-smoke")]
                if fixture {
                    let _ = view.eval_with_callback("window.__L4A_EXPORT_MAILBOX_V1__ !== undefined", move |answer| diagnostic(true, serde_json::json!({"phase":"after-finish-eval", "mailboxPresent":answer})));
                }
            }
        });
    });
    if result.is_err() { state.busy.store(false, Ordering::SeqCst); }
    // A never-delivered evaluation cannot keep navigation locked forever. No OS
    // dialog or file write has started if the callback has not arrived.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(115));
        if !called.swap(true, Ordering::SeqCst) { state.busy.store(false, Ordering::SeqCst); }
    });
}

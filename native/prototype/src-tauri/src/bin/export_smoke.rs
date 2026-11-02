//! Synthetic Windows runtime harness. This binary requires the export-smoke feature
//! and is never bundled into the customer prototype MSI.
#[path = "../export_policy.rs"] mod export_policy;
#[cfg(target_os = "windows")]
#[path = "../windows_export.rs"] mod windows_export;
const HOST: &str = "loyalty-for-all-community.sammielee.chatgpt.site";

#[cfg(target_os = "windows")]
fn main() {
    use std::sync::{Arc, atomic::Ordering};
    let scenario = std::env::var("L4A_EXPORT_SMOKE_SCENARIO").expect("Explicit synthetic scenario required");
    assert!(["saved-json", "saved-csv", "cancel", "exists", "repeated", "invalid", "oversized", "timeout-retry", "busy-navigation"].contains(&scenario.as_str()));
    let report = std::path::PathBuf::from(std::env::var("L4A_EXPORT_SMOKE_REPORT").expect("Explicit report path required"));
    assert!(report.is_absolute() && !report.exists());
    tauri::Builder::default().setup(move |app| {
        let state = Arc::new(windows_export::ExportState::default());
        let navigation = state.clone();
        let init = format!("window.__L4A_SMOKE_SCENARIO__={};\n{}", serde_json::to_string(&scenario).unwrap(), include_str!("../../../scripts/export-smoke-fixture.js"));
        tauri::WebviewWindowBuilder::new(app, "export-smoke", tauri::WebviewUrl::App("index.html".into()))
            .title("L4A SYNTHETIC EXPORT TEST ONLY")
            .initialization_script(include_str!("../export-mailbox.js"))
            .initialization_script(&init)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
            .on_navigation(move |url| {
                if navigation.busy.load(Ordering::SeqCst) { return false; }
                navigation.generation.fetch_add(1, Ordering::SeqCst);
                (url.scheme() == "tauri" && url.host_str() == Some("localhost")) || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
            })
            .on_download(move |view, event| {
                if let tauri::webview::DownloadEvent::Requested { url, .. } = event {
                    windows_export::requested_fixture(view, url, state.clone());
                }
                false
            })
            .on_document_title_changed(move |_, title| {
                if title == "L4A_EXPORT_STAGE:timeout-busy" {
                    std::fs::write(report.with_extension("stage"), "cancel-first-dialog").expect("Cannot write smoke stage");
                }
                if let Some(value) = title.strip_prefix("L4A_EXPORT_RESULT:") {
                    let result: serde_json::Value = serde_json::from_str(value).expect("Fixture emitted invalid JSON");
                    let temporary = report.with_extension("tmp");
                    std::fs::write(&temporary, serde_json::to_vec_pretty(&result).unwrap()).expect("Cannot write synthetic result");
                    std::fs::rename(&temporary, &report).expect("Cannot publish synthetic result");
                }
            }).build()?;
        Ok(())
    }).run(tauri::generate_context!()).expect("Synthetic export harness startup failed");
}
#[cfg(not(target_os = "windows"))]
fn main() { panic!("Windows-only synthetic runtime harness"); }

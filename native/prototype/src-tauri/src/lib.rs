mod export_policy;
#[cfg(target_os = "windows")]
mod windows_export;
const HOST: &str = "loyalty-for-all-community.sammielee.chatgpt.site";
const TITLE: &str = "Loyalty4All Community Edition — TEST ONLY";

fn allowed_navigation(url: &tauri::Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() { return false; }
    let hosted = url.scheme() == "https"
        && url.host_str() == Some(HOST)
        && url.port_or_known_default() == Some(443);
    let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost") && url.port().is_none());
    hosted || local
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // No plugins, invoke handlers, filesystem capabilities or auth shortcuts.
        // Windows has a bounded, content-only export mailbox; paths stay native.
        .setup(|app| {
            #[cfg(target_os = "windows")]
            let export_state = std::sync::Arc::new(windows_export::ExportState::default());
            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title(TITLE)
                .inner_size(1100.0, 800.0)
                .devtools(false)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
                .on_document_title_changed(|window, _| { let _ = window.set_title(TITLE); })
                ;
            #[cfg(target_os = "windows")]
            let builder = {
                let navigation_state = export_state.clone();
                builder.initialization_script(include_str!("export-mailbox.js"))
                    .on_navigation(move |url| {
                        use std::sync::atomic::Ordering;
                        if navigation_state.busy.load(Ordering::SeqCst) { return false; }
                        navigation_state.generation.fetch_add(1, Ordering::SeqCst);
                        allowed_navigation(url)
                    })
                    .on_download(move |view, event| {
                        if let tauri::webview::DownloadEvent::Requested { url, .. } = event {
                            windows_export::requested(view, url, export_state.clone());
                        }
                        false // WebView disk downloads remain denied on EVERY path.
                    })
            };
            #[cfg(not(target_os = "windows"))]
            let builder = builder.on_navigation(allowed_navigation).on_download(|_, _| false);
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start the Community Edition test prototype");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_exact_host_and_local_landing_are_allowed() {
        for value in ["https://loyalty-for-all-community.sammielee.chatgpt.site/community/", "tauri://localhost/index.html", "http://tauri.localhost/index.html"] {
            assert!(allowed_navigation(&value.parse().unwrap()));
        }
        for value in ["https://evil.example/", "http://loyalty-for-all-community.sammielee.chatgpt.site/", "https://loyalty-for-all-community.sammielee.chatgpt.site.evil.example/", "https://user@loyalty-for-all-community.sammielee.chatgpt.site/", "https://loyalty-for-all-community.sammielee.chatgpt.site:444/", "file:///tmp/x", "javascript:alert(1)"] {
            assert!(!allowed_navigation(&value.parse().unwrap()));
        }
    }
}

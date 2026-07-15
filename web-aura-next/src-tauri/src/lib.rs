use std::process::Command;

/// 在客户端本地执行 Shell 命令
/// 注意：此命令仅在 Tauri 桌面客户端中可用，非 Tauri 环境请使用服务端 API
#[tauri::command]
fn execute_shell(command: String, args: Vec<String>, cwd: Option<String>) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args);

    if let Some(dir) = cwd {
        cmd.current_dir(&dir);
    }

    let output = cmd.output().map_err(|e| format!("Shell 执行失败: {}", e))?;

    Ok(serde_json::json!({
        "code": output.status.code().unwrap_or(-1),
        "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
        "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![execute_shell])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

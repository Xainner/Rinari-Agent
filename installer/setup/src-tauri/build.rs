use std::{env, fs, path::PathBuf};

fn main() {
    tauri_build::build();
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let payload = manifest.join("resources/payload/Rinari-Agent-Payload.zip");
    println!("cargo:rerun-if-changed={}", payload.display());
    let generated =
        PathBuf::from(env::var("OUT_DIR").expect("out dir")).join("embedded_payload.rs");
    let source = if payload.is_file() {
        format!(
            "pub static EMBEDDED_PAYLOAD: Option<&[u8]> = Some(include_bytes!(r#\"{}\"#));",
            payload.display()
        )
    } else {
        "pub static EMBEDDED_PAYLOAD: Option<&[u8]> = None;".to_string()
    };
    fs::write(generated, source).expect("write embedded payload descriptor");
}

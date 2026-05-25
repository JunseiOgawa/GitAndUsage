use std::fs;
use std::path::Path;
use tauri_app_lib::usage::{load_cached_snapshots, save_snapshots_to_json, UsageSnapshot};
use tempfile::tempdir;

fn create_test_snapshot(provider: &str, display: &str, used: f64, limit: f64) -> UsageSnapshot {
    UsageSnapshot {
        provider: provider.to_string(),
        display_name: display.to_string(),
        account_label: "test_user@example.com".to_string(),
        plan_label: "Developer Plan".to_string(),
        used,
        limit,
        unit: "requests".to_string(),
        status: "ok".to_string(),
        last_updated_at: "2026-05-23T10:00:00Z".to_string(),
    }
}

#[test]
fn test_save_and_load_normal_snapshots() {
    let dir = tempdir().expect("Failed to create temp dir");
    let file_path = dir.path().join("snapshots.json");

    let snapshots = vec![
        create_test_snapshot("codex", "Codex", 45.0, 100.0),
        create_test_snapshot("claude", "Claude", 12.5, 50.0),
    ];

    // Save snapshots
    let save_result = save_snapshots_to_json(&file_path, &snapshots);
    assert!(
        save_result.is_ok(),
        "Saving normal snapshots failed: {:?}",
        save_result
    );

    // Verify file actually exists and contains serialized content
    assert!(file_path.exists());
    let file_content = fs::read_to_string(&file_path).expect("Failed to read test JSON file");
    assert!(file_content.contains("codex"));
    assert!(file_content.contains("claude"));

    // Load snapshots
    let loaded = load_cached_snapshots(&file_path);
    assert_eq!(loaded.len(), 2);

    assert_eq!(loaded[0].provider, "codex");
    assert_eq!(loaded[0].display_name, "Codex");
    assert_eq!(loaded[0].used, 45.0);
    assert_eq!(loaded[0].limit, 100.0);

    assert_eq!(loaded[1].provider, "claude");
    assert_eq!(loaded[1].display_name, "Claude");
    assert_eq!(loaded[1].used, 12.5);
    assert_eq!(loaded[1].limit, 50.0);
}

#[test]
fn test_save_snapshots_creates_parent_directories() {
    let dir = tempdir().expect("Failed to create temp dir");
    // Deeply nested subdirectories that do not exist yet
    let file_path = dir
        .path()
        .join("nested_dir")
        .join("deeply_nested")
        .join("snapshots.json");

    let snapshots = vec![create_test_snapshot("copilot", "Copilot", 2.0, 10.0)];

    // Save snapshots - should create parent directories successfully
    let save_result = save_snapshots_to_json(&file_path, &snapshots);
    assert!(
        save_result.is_ok(),
        "Saving and creating directories failed: {:?}",
        save_result
    );

    // Load snapshots and verify
    let loaded = load_cached_snapshots(&file_path);
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].provider, "copilot");
}

#[test]
fn test_load_non_existent_file() {
    // A completely fictitious path
    let non_existent_path = Path::new("completely_fictitious_file_12345.json");
    let loaded = load_cached_snapshots(non_existent_path);
    assert!(
        loaded.is_empty(),
        "Loading non-existent file should return an empty Vec, got: {:?}",
        loaded
    );
}

#[test]
fn test_load_directory_as_file() {
    let dir = tempdir().expect("Failed to create temp dir");
    // Pass the path of the directory itself
    let loaded = load_cached_snapshots(dir.path());
    assert!(
        loaded.is_empty(),
        "Loading a directory as a file should gracefully return an empty Vec, got: {:?}",
        loaded
    );
}

#[test]
fn test_load_empty_file() {
    let dir = tempdir().expect("Failed to create temp dir");
    let file_path = dir.path().join("empty.json");

    // Create an empty file (0 bytes)
    fs::File::create(&file_path).expect("Failed to create empty file");

    let loaded = load_cached_snapshots(&file_path);
    assert!(
        loaded.is_empty(),
        "Loading an empty file should return an empty Vec, got: {:?}",
        loaded
    );
}

#[test]
fn test_load_malformed_json_garbage() {
    let dir = tempdir().expect("Failed to create temp dir");
    let file_path = dir.path().join("garbage.json");

    // Write random text garbage
    fs::write(&file_path, "not a valid json string, just garbage text!!!")
        .expect("Failed to write garbage file");

    let loaded = load_cached_snapshots(&file_path);
    assert!(
        loaded.is_empty(),
        "Loading random garbage JSON should return an empty Vec fallback, got: {:?}",
        loaded
    );
}

#[test]
fn test_load_malformed_json_object() {
    let dir = tempdir().expect("Failed to create temp dir");
    let file_path = dir.path().join("object.json");

    // Write a valid JSON object instead of an array
    fs::write(
        &file_path,
        r#"{"provider": "codex", "display_name": "Codex"}"#,
    )
    .expect("Failed to write object JSON file");

    let loaded = load_cached_snapshots(&file_path);
    assert!(
        loaded.is_empty(),
        "Loading valid JSON object (expected array) should return an empty Vec, got: {:?}",
        loaded
    );
}

#[test]
fn test_load_malformed_json_missing_fields() {
    let dir = tempdir().expect("Failed to create temp dir");
    let file_path = dir.path().join("missing_fields.json");

    // Write a JSON array of objects but missing required fields or having incorrect types
    fs::write(
        &file_path,
        r#"[{"provider": "codex", "used": "wrong_type_string"}]"#,
    )
    .expect("Failed to write invalid schema JSON file");

    let loaded = load_cached_snapshots(&file_path);
    assert!(
        loaded.is_empty(),
        "Loading invalid schema array should return an empty Vec, got: {:?}",
        loaded
    );
}

#[test]
fn test_save_invalid_path_file_in_way_errors() {
    let dir = tempdir().expect("Failed to create temp dir");

    // Create a regular file where a directory is expected
    let file_in_way = dir.path().join("file_in_way");
    fs::write(&file_in_way, "I am a file, not a directory").expect("Failed to write blocker file");

    // Try to save to a path nested inside the file
    let invalid_file_path = file_in_way.join("snapshots.json");
    let snapshots = vec![create_test_snapshot("codex", "Codex", 10.0, 100.0)];

    let save_result = save_snapshots_to_json(&invalid_file_path, &snapshots);
    assert!(
        save_result.is_err(),
        "Saving to a path blocked by a file should fail and return Err"
    );
}

#[test]
fn test_save_invalid_path_null_byte_errors() {
    // Windows paths cannot contain null bytes, and std::fs operations on such paths
    // will typically fail or return an error (or panic if unhandled by the OS adapter, but safe in std).
    let invalid_path = Path::new("some_invalid_path\0with_null_byte.json");
    let snapshots = vec![create_test_snapshot("codex", "Codex", 10.0, 100.0)];

    let save_result = save_snapshots_to_json(invalid_path, &snapshots);
    assert!(
        save_result.is_err(),
        "Saving to a path with null bytes should return Err"
    );
}

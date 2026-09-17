//! Engine Protocol v1 types (desktop side).
//!
//! Mirrors `Rinari-CLI/src/rinari/engine_protocol`: NDJSON envelopes,
//! handshake, typed responses, and engine events. Unknown fields are
//! ignored on parse so minor engine additions stay forward-compatible.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_NAME: &str = "rinari-engine";
/// Major protocol version this client speaks. The engine must report the
/// same major version or the supervisor refuses to connect.
pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct OutgoingRequest {
    pub id: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Hello {
    #[serde(rename = "type")]
    pub kind: String,
    pub protocol: String,
    pub protocol_version: u32,
    pub engine_version: String,
    #[serde(default)]
    pub capabilities: HashMap<String, bool>,
    /// Stable identity of the Engine home (a digest of its resolved path).
    /// Unlike `engine_instance_id` it survives restarts; older engines omit it.
    #[serde(default)]
    pub home_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EngineError {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub retryable: bool,
    #[serde(default)]
    pub details: Value,
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct IncomingResponse {
    pub id: Option<String>,
    #[serde(default)]
    pub ok: bool,
    pub result: Option<Value>,
    pub error: Option<EngineError>,
}

/// An async engine event: `{"type": "event", "event": "<name>", "payload": {...}}`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EngineEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub event: String,
    #[serde(default)]
    pub payload: Value,
}

/// Classify one stdout line: handshake, response, event, or ignorable.
#[derive(Debug, Clone)]
pub enum Frame {
    Hello(Hello),
    Response(IncomingResponse),
    Event(EngineEvent),
    Ignored,
}

pub fn parse_hello(value: &Value) -> Result<Hello, String> {
    let hello: Hello =
        serde_json::from_value(value.clone()).map_err(|e| format!("invalid hello: {e}"))?;
    if hello.kind != "hello" {
        return Err("first line is not a hello".to_string());
    }
    if hello.protocol != PROTOCOL_NAME {
        return Err(format!("unexpected protocol: {}", hello.protocol));
    }
    if hello.protocol_version != PROTOCOL_VERSION {
        return Err(format!(
            "incompatible protocol version: engine={}, client={} (refusing to connect)",
            hello.protocol_version, PROTOCOL_VERSION
        ));
    }
    Ok(hello)
}

pub fn classify_line(line: &str) -> Frame {
    let value: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(_) => return Frame::Ignored,
    };
    if value.get("type").and_then(Value::as_str) == Some("hello") {
        return match serde_json::from_value::<Hello>(value) {
            Ok(hello) => Frame::Hello(hello),
            Err(_) => Frame::Ignored,
        };
    }
    if value.get("type").and_then(Value::as_str) == Some("event") {
        return match serde_json::from_value::<EngineEvent>(value) {
            Ok(event) => Frame::Event(event),
            Err(_) => Frame::Ignored,
        };
    }
    if value.get("id").is_some() && value.get("ok").is_some() {
        return match serde_json::from_value::<IncomingResponse>(value) {
            Ok(response) => Frame::Response(response),
            Err(_) => Frame::Ignored,
        };
    }
    Frame::Ignored
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn hello_value() -> Value {
        json!({
            "type": "hello",
            "protocol": "rinari-engine",
            "protocol_version": 1,
            "engine_version": "0.1.0",
            "capabilities": {"chat": true, "projects": true},
            "future_field": ["ignored"],
        })
    }

    #[test]
    fn hello_accepts_compatible_engine() {
        let hello = parse_hello(&hello_value()).expect("compatible hello");
        assert_eq!(hello.engine_version, "0.1.0");
        assert_eq!(hello.capabilities.get("chat"), Some(&true));
    }

    #[test]
    fn hello_rejects_wrong_protocol_name() {
        let mut value = hello_value();
        value["protocol"] = json!("other-engine");
        assert!(parse_hello(&value).is_err());
    }

    #[test]
    fn hello_rejects_incompatible_major_version() {
        let mut value = hello_value();
        value["protocol_version"] = json!(2);
        let err = parse_hello(&value).expect_err("must refuse");
        assert!(err.contains("incompatible protocol version"));
    }

    #[test]
    fn response_frames_resolve_by_id() {
        let line = r#"{"id":"req_7","ok":true,"result":{"sessions":[]},"extra":"ignored"}"#;
        match classify_line(line) {
            Frame::Response(response) => {
                assert_eq!(response.id.as_deref(), Some("req_7"));
                assert!(response.ok);
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[test]
    fn failure_frames_carry_machine_codes() {
        let line = r#"{"id":"r1","ok":false,"error":{"code":"TURN_RUNNING","message":"busy","retryable":false,"details":{}}}"#;
        match classify_line(line) {
            Frame::Response(response) => {
                assert!(!response.ok);
                assert_eq!(
                    response.error.map(|e| e.code).as_deref(),
                    Some("TURN_RUNNING")
                );
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[test]
    fn event_frames_keep_session_turn_ids() {
        let line = r#"{"type":"event","event":"model.content.delta","payload":{"turn_id":"t1","session_id":"s1","delta":"hi"}}"#;
        match classify_line(line) {
            Frame::Event(event) => {
                assert_eq!(event.event, "model.content.delta");
                assert_eq!(event.payload["turn_id"], json!("t1"));
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[test]
    fn garbage_lines_are_ignored_not_fatal() {
        assert!(matches!(classify_line("not json"), Frame::Ignored));
        assert!(matches!(classify_line(r#"{"id":"x"}"#), Frame::Ignored));
        assert!(matches!(classify_line(""), Frame::Ignored));
    }
}

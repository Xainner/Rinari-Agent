//! NDJSON transport over the engine child process stdio.
//!
//! Layout: the writer lives behind a mutex on the calling thread, a
//! dedicated reader thread parses stdout lines and completes pending
//! requests by id or forwards events. All blocking I/O stays off the
//! Tauri async runtime.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc::{self, Receiver, RecvTimeoutError, Sender},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::engine::protocol::{
    classify_line, parse_hello, EngineError, EngineEvent, Frame, Hello, OutgoingRequest,
};

/// How long the first stdout line (hello) may take after spawn.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
/// Default ceiling for one request/response round-trip. Turn execution
/// itself is async (accepted immediately, terminal state via events).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug)]
pub enum TransportError {
    Spawn(String),
    Handshake(String),
    Io(String),
    Timeout(String),
    Engine(EngineError),
    ShutDown,
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(message)
            | Self::Handshake(message)
            | Self::Io(message)
            | Self::Timeout(message) => write!(f, "{message}"),
            Self::Engine(error) => write!(f, "{error}"),
            Self::ShutDown => write!(f, "engine transport is shut down"),
        }
    }
}

type PendingReply = Sender<Result<Value, EngineError>>;

struct Pending {
    replies: Mutex<HashMap<String, PendingReply>>,
}

pub struct EngineTransport {
    next_id: AtomicU64,
    stdin: Mutex<ChildStdin>,
    pending: Arc<Pending>,
    events: Mutex<Receiver<EngineEvent>>,
    child: Mutex<Option<Child>>,
    reader: Mutex<Option<JoinHandle<()>>>,
    stderr_drain: Mutex<Option<JoinHandle<()>>>,
}

impl EngineTransport {
    /// Spawn `program args…` and complete the handshake. On success the
    /// reader loop is running; poll events with [`EngineTransport::try_recv_event`].
    pub fn spawn(
        program: &str,
        args: &[String],
        cwd: Option<&std::path::Path>,
    ) -> Result<(Self, Hello), TransportError> {
        let mut command = Command::new(program);
        command.args(args);
        command
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8");
        if let Some(dir) = cwd {
            command.current_dir(dir);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Sin ventana de consola propia en Windows: el engine es un hijo
        // invisible (su stderr se drena al log). El exe ya es windowed en
        // release vía windows_subsystem; esto cubre al python hijo.
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|e| TransportError::Spawn(e.to_string()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| TransportError::Spawn("no stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| TransportError::Spawn("no stdout".to_string()))?;
        let stderr = child.stderr.take();

        let (event_tx, event_rx) = mpsc::channel::<EngineEvent>();
        let (hello_tx, hello_rx) = mpsc::channel::<Result<Hello, String>>();
        let pending = Arc::new(Pending {
            replies: Mutex::new(HashMap::new()),
        });
        let reader_pending = Arc::clone(&pending);
        let reader = thread::Builder::new()
            .name("engine-protocol-reader".to_string())
            .spawn(move || {
                reader_loop(stdout, reader_pending, event_tx, Some(hello_tx));
            })
            .map_err(|e| TransportError::Spawn(e.to_string()))?;

        let hello = hello_rx
            .recv_timeout(HANDSHAKE_TIMEOUT)
            .map_err(|_| {
                TransportError::Handshake("timed out waiting for engine hello".to_string())
            })?
            .map_err(TransportError::Handshake)?;

        let stderr_drain = stderr.map(|stderr| {
            thread::Builder::new()
                .name("engine-stderr-drain".to_string())
                .spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().map_while(Result::ok) {
                        let line = line.trim();
                        if !line.is_empty() {
                            eprintln!("[rinari-engine] {line}");
                        }
                    }
                })
                .expect("spawn stderr drain")
        });

        Ok((
            Self {
                next_id: AtomicU64::new(1),
                stdin: Mutex::new(stdin),
                pending,
                events: Mutex::new(event_rx),
                child: Mutex::new(Some(child)),
                reader: Mutex::new(Some(reader)),
                stderr_drain: Mutex::new(stderr_drain),
            },
            hello,
        ))
    }

    /// Send a request and wait for its response envelope.
    pub fn request(&self, method: &str, params: Option<Value>) -> Result<Value, TransportError> {
        self.request_with_timeout(method, params, REQUEST_TIMEOUT)
    }

    /// Send a request with a deadline selected by the public operation.
    pub fn request_with_timeout(
        &self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Value, TransportError> {
        let id = format!("req_{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        let (reply_tx, reply_rx) = mpsc::channel::<Result<Value, EngineError>>();
        {
            let mut pending = self
                .pending
                .replies
                .lock()
                .map_err(|_| TransportError::ShutDown)?;
            pending.insert(id.clone(), reply_tx);
        }
        let line = serde_json::to_string(&OutgoingRequest {
            id: id.clone(),
            method: method.to_string(),
            params,
        })
        .map_err(|e| TransportError::Io(e.to_string()))?;
        let write_result = {
            let mut stdin = self.stdin.lock().map_err(|_| TransportError::ShutDown)?;
            writeln!(stdin, "{line}")
                .and_then(|_| stdin.flush())
                .map_err(|e| e.to_string())
        };
        if let Err(message) = write_result {
            self.pending
                .replies
                .lock()
                .ok()
                .map(|mut pending| pending.remove(&id));
            return Err(TransportError::Io(message));
        }
        match reply_rx.recv_timeout(timeout) {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => Err(TransportError::Engine(error)),
            Err(RecvTimeoutError::Timeout) => {
                self.pending
                    .replies
                    .lock()
                    .ok()
                    .map(|mut pending| pending.remove(&id));
                Err(TransportError::Timeout(format!(
                    "request {id} ({method}) timed out"
                )))
            }
            Err(RecvTimeoutError::Disconnected) => Err(TransportError::ShutDown),
        }
    }

    /// Non-blocking event poll for the forward pump.
    pub fn try_recv_event(&self) -> Option<EngineEvent> {
        self.events.lock().ok()?.try_recv().ok()
    }

    /// True while the child handle is still running. False after shutdown
    /// (handle taken) or when the process exited (crash detection).
    pub fn is_running(&self) -> bool {
        match self.child.lock() {
            Ok(mut child) => match child.as_mut() {
                Some(child) => matches!(child.try_wait(), Ok(None)),
                None => false,
            },
            Err(_) => false,
        }
    }

    /// Terminate the child and join I/O threads. Idempotent and bounded:
    /// never blocks longer than the deadlines below.
    pub fn shutdown(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
                // wait() has no deadline; poll try_wait instead so an
                // orphaned grandchild (e.g. dev wrapper `uv run` leaves
                // python alive holding our pipes) can never hang shutdown.
                let start = Instant::now();
                while start.elapsed() < Duration::from_secs(2) {
                    match child.try_wait() {
                        Ok(Some(_)) | Err(_) => break,
                        Ok(None) => thread::sleep(Duration::from_millis(20)),
                    }
                }
            }
        }
        // Reader/drain threads end on pipe EOF; an orphaned grandchild may
        // hold the pipes open, so join them with a deadline and detach.
        // Production spawns the sidecar directly (no wrapper), so the
        // orphan case is a dev-wrapper artifact; detached threads die with
        // the process and restarts are rare.
        if let Ok(mut reader) = self.reader.lock() {
            if let Some(reader) = reader.take() {
                join_deadline(reader, Duration::from_secs(3));
            }
        }
        if let Ok(mut drain) = self.stderr_drain.lock() {
            if let Some(drain) = drain.take() {
                join_deadline(drain, Duration::from_secs(3));
            }
        }
    }
}

impl Drop for EngineTransport {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Join with a deadline; on expiry the handle is dropped (thread detached)
/// instead of hanging the caller. The thread still ends on pipe EOF or
/// process exit.
fn join_deadline(handle: JoinHandle<()>, deadline: Duration) {
    let start = Instant::now();
    while !handle.is_finished() && start.elapsed() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
}

fn reader_loop(
    stdout: ChildStdout,
    pending: Arc<Pending>,
    event_tx: Sender<EngineEvent>,
    hello_tx: Option<Sender<Result<Hello, String>>>,
) {
    let mut hello_tx = hello_tx;
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // The very first frame must be the handshake; it unblocks spawn().
        if let Some(tx) = hello_tx.take() {
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(line);
            let result = parsed
                .map_err(|e| format!("first stdout line is not JSON: {e}"))
                .and_then(|value| parse_hello(&value));
            let _ = tx.send(result);
            continue;
        }
        match classify_line(line) {
            Frame::Response(response) => {
                if let Some(id) = response.id {
                    let reply = {
                        let Ok(mut pending) = pending.replies.lock() else {
                            break;
                        };
                        pending.remove(&id)
                    };
                    if let Some(reply) = reply {
                        let payload = if response.ok {
                            Ok(response.result.unwrap_or(Value::Null))
                        } else if let Some(error) = response.error {
                            Err(error)
                        } else {
                            Err(EngineError {
                                code: "MALFORMED_RESPONSE".to_string(),
                                message: "response has ok=false without an error".to_string(),
                                retryable: false,
                                details: Value::Null,
                            })
                        };
                        let _ = reply.send(payload);
                    }
                }
            }
            Frame::Event(event) => {
                if event_tx.send(event).is_err() {
                    break;
                }
            }
            Frame::Hello(_) | Frame::Ignored => {}
        }
    }
    // EOF: wake every waiter so requests fail fast instead of hanging.
    if let Ok(mut pending) = pending.replies.lock() {
        for (_, reply) in pending.drain() {
            let _ = reply.send(Err(EngineError {
                code: "ENGINE_EOF".to_string(),
                message: "engine stdout closed".to_string(),
                retryable: false,
                details: Value::Null,
            }));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canned_hello() -> Value {
        serde_json::json!({
            "type": "hello",
            "protocol": "rinari-engine",
            "protocol_version": 1,
            "engine_version": "test",
            "capabilities": {},
        })
    }

    #[test]
    fn hello_gate_parses_before_routing() {
        // The reader consumes exactly one hello frame first; simulate the
        // decision inline: a hello line must not be routed as a response.
        let line = serde_json::to_string(&canned_hello()).unwrap();
        assert!(matches!(classify_line(&line), Frame::Hello(_)));
    }
}

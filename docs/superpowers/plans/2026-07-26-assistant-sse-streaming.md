# Assistant SSE Streaming — Completed

LiteCAD ordinary Assistant sends now use an authenticated POST SSE route while retaining the JSON message route for compatibility. The backend emits truthful execution stages, streams provider-supplied reasoning summaries and answer content, rejects incomplete or oversized upstream streams, and persists the same final message/artifact result as the compatibility path.

The Assistant panel immediately shows localized progress, incrementally renders Markdown, follows new content only while the user remains near the bottom, and preserves partial output after interruption. Each send carries a unique `client_request_id` persisted on both messages, allowing exact post-persistence disconnect reconciliation and eliminating transient duplicate local/persisted messages. Route or conversation replacement aborts the request and stale callbacks are ignored.

Verification completed on 2026-07-26:

- `task check`
- `task test` — 89 frontend test files / 467 frontend tests plus Go race/coverage suite
- `task test-browser` — 20 Playwright workflows
- Independent code review — no remaining Critical or Important findings

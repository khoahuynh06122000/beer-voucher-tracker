# System Guidelines & Project Learnings (AGENTS.md)

## Telegram Bot Integration & Polling Architecture
- **Server-Side Long Polling**: In containerized or preview environments, process Telegram Bot commands using server-side background polling (`getUpdates`).
- **Once-Only Webhook Cleanup**: Never call `deleteWebhook` in every polling iteration right before `getUpdates`. Maintain a boolean flag (`telegramWebhookCleared`) to execute `deleteWebhook` once on startup or when an HTTP 409 Conflict is encountered. Calling `deleteWebhook` repeatedly on every poll triggers Telegram race conditions and causes `getUpdates` to fail with HTTP 409.
- **No Timestamp Message Dropping**: Do NOT filter out messages using timestamp comparisons like `now - msgDate < 300`. Since `telegramPollingOffset` guarantees at-most-once delivery, timestamp filters silently discard valid user commands sent during server restarts, network delays, or minor clock skews.
- **Bot Handle Sanitization**: Strip bot handle suffixes (e.g., `@beervoucher_bot`) from command text using `text.replace(/@\w+/g, "")` before matching command keywords.
- **Robust Message Reply & Plain Text Fallback**: Wrap command processing in `try-catch` blocks and provide an automatic fallback to plain-text messages if Telegram rejects HTML parsing (`parse_mode: "HTML"`).
- **Offset Management**: Update `telegramPollingOffset = update_id + 1` immediately upon receiving updates to guarantee at-most-once processing.

## MS Teams Webhook Integration
- **Cross-Platform Triggering**: When receiving commands containing keywords like `"gửi ms teams"`, `"teams"`, or `"webhook"` from Telegram, pull live report data from Firestore, format the payload as an MS Teams Adaptive Card, and dispatch it to the configured MS Teams Webhook URL.
- **Dual Payload Fallback**: Attempt both direct Adaptive Card payloads and Power Automate wrapped payloads (`type: "message", attachments: [...]`) to ensure 100% delivery across Workflow and Incoming Webhook types.

## Unattended / Zero-Touch UX
- Auto-initialize bot polling and Webhook status check on server start and page mount so no manual click is required by the end user.

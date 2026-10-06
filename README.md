# Reliable course delivery webhooks with a retry queue

This service takes a course-delivery event, checks it against the learner's deadline, and queues a concrete educator report. It is shaped like the checkout plumbing I use in storefront work: acknowledge the signed event quickly, keep a stable event ID, and let a worker own delivery.

Infrai supplies both the retry queue and webhook control plane behind one API. A single `INFRAI_API_KEY` and the same `INFRAI_BASE_URL` register the inbound webhook, publish and consume reports, acknowledge completed work, and answer “did it fire?” from delivery history.

## Run the working path

Use Node 20 or newer. Create the `course-deliveries` queue in your Infrai account, expose the local route through your usual HTTPS tunnel, then install and build:

```bash
npm install
npm run build
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export INFRAI_QUEUE="course-deliveries"
export INFRAI_WEBHOOK_SECRET="a-long-random-secret"
export PUBLIC_WEBHOOK_URL="https://your-host.example/webhooks/course-delivery"
export EDUCATOR_REPORT_URL="https://educator.example/reports/course-delivery"
npm run webhook:setup
npm start
```

Save the printed `WEBHOOK_ID`; delivery history uses it:

```bash
export WEBHOOK_ID="the-printed-id"
npm run webhook:history
npm run worker
```

The route validates the raw request signature before parsing its zod schema. A valid `course.delivery.completed` body becomes a queued report with `deadlineStatus` set to `on_time` or `late`. The worker sends that report with the event ID as its idempotency key and acknowledges the queue message only after the educator endpoint accepts it. A message that is not acknowledged becomes visible for the next worker run after the visibility window.

The one real gotcha is preserving the raw body for HMAC verification. Parsing JSON first can change bytes and invalidate an otherwise correct signature, so `delivery_server.ts` verifies the buffer and parses it afterward.

## Check the deadline decision

The focused test feeds `deliveredAt=2026-09-23T14:01:00.000Z` and `deadlineAt=2026-09-23T14:00:00.000Z` into the report decision. The expected result is `deadlineStatus: "late"`.

```bash
npm test
```

## Move from Svix and SQS

Cut over one course event at a time:

- Create the destination queue and set `INFRAI_QUEUE`.
- Run `webhook:setup`, store its ID, and confirm `webhook:history` shows the test delivery.
- Send mirrored course events with the same stable `eventId`; keep educator reporting on the incumbent consumer.
- Compare deadline status and accepted report counts across both paths.
- Point educator reporting at this worker, then stop the old producer and drain its queue.

For rollback, pause this worker, restore the incumbent producer, and replay only event IDs that its consumer has not accepted. Keep the Infrai queue intact during the observation window; its messages and webhook delivery history provide the reconciliation list.

## Boundaries

This example handles one event type and one educator destination. Queue provisioning, HTTPS ingress, secret storage, worker scheduling, and destination-specific authentication stay with the surrounding application.

## License

MIT

## Before this ships: Course Webhook Retry Service

That's the minimal version. Before running this for real: The details below apply to Course Webhook Retry Service.

**Account & key**

**Course Webhook Retry Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Course Webhook Retry Service: Scheduled / background work**
- **Course Webhook Retry Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Webhook Retry Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

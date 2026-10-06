import { z } from "zod";
import { courseDeliverySchema } from "./course_delivery.js";
import { infrai } from "./infrai.js";

const queuedMessageSchema = z.object({
  message_id: z.string(),
  payload: courseDeliverySchema.extend({ deadlineStatus: z.enum(["on_time", "late"]) }),
});

const consumeResultSchema = z.object({ items: z.array(queuedMessageSchema).default([]) });

async function run(): Promise<void> {
  const reportURL = process.env.EDUCATOR_REPORT_URL;
  if (!reportURL) throw new Error("EDUCATOR_REPORT_URL is required");

  const batch = consumeResultSchema.parse(await infrai.queue.consume(10, 30));
  for (const message of batch.items) {
    const response = await fetch(reportURL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": message.payload.eventId,
      },
      body: JSON.stringify(message.payload),
    });
    if (response.ok) {
      await infrai.queue.ack(message.message_id);
      console.log(`reported ${message.payload.eventId}`);
    } else {
      console.log(`delivery retained for retry: ${message.payload.eventId}`);
    }
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

import { z } from "zod";
import { infrai } from "./infrai.js";

const registeredSchema = z.object({ id: z.string() });
const historySchema = z.object({ items: z.array(z.unknown()).default([]) });

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "setup") {
    const url = process.env.PUBLIC_WEBHOOK_URL;
    const secret = process.env.INFRAI_WEBHOOK_SECRET;
    if (!url || !secret) throw new Error("PUBLIC_WEBHOOK_URL and INFRAI_WEBHOOK_SECRET are required");
    const result = registeredSchema.parse(
      await infrai.account.webhooks.register(url, ["course.delivery.completed"], secret),
    );
    console.log(`WEBHOOK_ID=${result.id}`);
    return;
  }
  if (command === "history") {
    const id = process.env.WEBHOOK_ID;
    if (!id) throw new Error("WEBHOOK_ID is required");
    const history = historySchema.parse(await infrai.account.webhooks.deliveries(id));
    console.log(JSON.stringify(history.items, null, 2));
    return;
  }
  throw new Error("Use setup or history");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

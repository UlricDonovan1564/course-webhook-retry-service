import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { buildEducatorReport, courseDeliverySchema } from "./course_delivery.js";
import { InfraiError, infrai } from "./infrai.js";

const deliveryEventSchema = z.object({
  type: z.literal("course.delivery.completed"),
  data: courseDeliverySchema,
});

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function signatureMatches(rawBody: Buffer, supplied: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const candidate = supplied.startsWith("sha256=") ? supplied.slice(7) : supplied;
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/webhooks/course-delivery") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  const secret = process.env.INFRAI_WEBHOOK_SECRET;
  if (!secret) throw new Error("INFRAI_WEBHOOK_SECRET is required");
  const rawBody = await readBody(request);
  const signature = request.headers["x-infrai-signature"];
  if (typeof signature !== "string" || !signatureMatches(rawBody, signature, secret)) {
    json(response, 401, { error: "invalid_signature" });
    return;
  }

  const event = deliveryEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
  const report = buildEducatorReport(event.data);
  await infrai.queue.publish(report);
  json(response, 202, { eventId: report.eventId, deadlineStatus: report.deadlineStatus });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
      });
      return;
    }
    console.error(error);
    json(response, 500, { error: "internal_error" });
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`course delivery webhook listening on :${port}`));

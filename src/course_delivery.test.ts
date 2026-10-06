import assert from "node:assert/strict";
import test from "node:test";
import { buildEducatorReport } from "./course_delivery.js";

test("marks a course delivery after its learner deadline as late", () => {
  const report = buildEducatorReport({
    eventId: "c5f30570-7311-4c2e-9f34-48802408fdb0",
    courseId: "checkout-foundations",
    learnerId: "learner-42",
    educatorId: "educator-7",
    deliveredAt: "2026-09-23T14:01:00.000Z",
    deadlineAt: "2026-09-23T14:00:00.000Z",
  });

  assert.equal(report.deadlineStatus, "late");
});

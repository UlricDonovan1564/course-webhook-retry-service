import { z } from "zod";

export const courseDeliverySchema = z.object({
  eventId: z.string().uuid(),
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  educatorId: z.string().min(1),
  deliveredAt: z.string().datetime(),
  deadlineAt: z.string().datetime(),
});

export type CourseDelivery = z.infer<typeof courseDeliverySchema>;

export type EducatorReport = CourseDelivery & {
  deadlineStatus: "on_time" | "late";
};

export function buildEducatorReport(delivery: CourseDelivery): EducatorReport {
  const delivered = Date.parse(delivery.deliveredAt);
  const deadline = Date.parse(delivery.deadlineAt);
  return {
    ...delivery,
    deadlineStatus: delivered <= deadline ? "on_time" : "late",
  };
}

export const TASK_REMINDER_ORDER_ID_PARAM = "orderId";
export const TASK_REMINDER_QUEUE_PARAM = "queue";

export function taskReminderHref(
  path: string,
  opts?: { orderId?: string; queue?: "rearrange" },
): string {
  const params = new URLSearchParams();
  if (opts?.orderId) params.set(TASK_REMINDER_ORDER_ID_PARAM, opts.orderId);
  if (opts?.queue) params.set(TASK_REMINDER_QUEUE_PARAM, opts.queue);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

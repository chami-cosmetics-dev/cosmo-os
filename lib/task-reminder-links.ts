export const TASK_REMINDER_ORDER_ID_PARAM = "orderId";
export const TASK_REMINDER_QUEUE_PARAM = "queue";
export const TASK_REMINDER_WAYBILL_ID_PARAM = "waybillId";

export function taskReminderHref(
  path: string,
  opts?: { orderId?: string; queue?: "rearrange"; waybillId?: string },
): string {
  const params = new URLSearchParams();
  if (opts?.orderId) params.set(TASK_REMINDER_ORDER_ID_PARAM, opts.orderId);
  if (opts?.queue) params.set(TASK_REMINDER_QUEUE_PARAM, opts.queue);
  if (opts?.waybillId) params.set(TASK_REMINDER_WAYBILL_ID_PARAM, opts.waybillId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

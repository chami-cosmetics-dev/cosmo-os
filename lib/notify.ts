import { toast } from "sonner";

export const notify = {
  success: (message: string, id?: string) => toast.success(message, id ? { id } : undefined),
  error: (message: string, id?: string) => toast.error(message, id ? { id } : undefined),
  info: (message: string, id?: string) => toast.info(message, id ? { id } : undefined),
  loading: (message: string, id: string) => toast.loading(message, { id }),
  dismiss: (id?: string) => toast.dismiss(id),
};

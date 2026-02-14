import { api } from "./client";

export type Item = {
  id: string;
  name: string;
  createdAt: string;
};

export const itemsApi = {
  getItems: () => api.get<Item[]>("/api/items"),

  getItem: (id: string) => api.get<Item>(`/api/items/${id}`),

  createItem: (data: { name: string }) =>
    api.post<Item>("/api/items", data),

  updateItem: (id: string, data: { name?: string }) =>
    api.put<Item>(`/api/items/${id}`, data),

  patchItem: (id: string, data: { name?: string }) =>
    api.patch<Item>(`/api/items/${id}`, data),

  deleteItem: (id: string) => api.delete<void>(`/api/items/${id}`),
};

import { api } from "./client";

export type ProductItem = {
  id: string;
  companyId: string;
  companyLocationId: string;
  shopifyLocationId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  vendorId: string | null;
  categoryId: string | null;
  status: string | null;
  productType: string | null;
  handle: string | null;
  imageUrl: string | null;
  tags: string | null;
  barcode: string | null;
  inventoryQuantity: number;
  createdAt: string;
  updatedAt: string;
  vendor?: { id: string; name: string } | null;
  category?: { id: string; name: string; fullName: string | null } | null;
  companyLocation?: { id: string; name: string; shopifyLocationId: string | null } | null;
};

export type Vendor = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count?: { productItems: number };
};

export type Category = {
  id: string;
  name: string;
  fullName: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { productItems: number };
};

export const productItemsApi = {
  getItems: (params?: {
    location_id?: string;
    vendor_id?: string;
    category_id?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.location_id) searchParams.set("location_id", params.location_id);
    if (params?.vendor_id) searchParams.set("vendor_id", params.vendor_id);
    if (params?.category_id) searchParams.set("category_id", params.category_id);
    if (params?.search) searchParams.set("search", params.search);
    const qs = searchParams.toString();
    return api.get<ProductItem[]>(`/api/admin/product-items${qs ? `?${qs}` : ""}`);
  },

  getItem: (id: string) => api.get<ProductItem>(`/api/admin/product-items/${id}`),
};

export const vendorsApi = {
  getVendors: () => api.get<Vendor[]>("/api/admin/vendors"),
  createVendor: (data: { name: string }) =>
    api.post<Vendor>("/api/admin/vendors", data),
  updateVendor: (id: string, data: { name: string }) =>
    api.put<Vendor>(`/api/admin/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete<void>(`/api/admin/vendors/${id}`),
};

export const categoriesApi = {
  getCategories: () => api.get<Category[]>("/api/admin/categories"),
  createCategory: (data: { name: string; fullName?: string }) =>
    api.post<Category>("/api/admin/categories", data),
  updateCategory: (id: string, data: { name: string; fullName?: string | null }) =>
    api.put<Category>(`/api/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete<void>(`/api/admin/categories/${id}`),
};

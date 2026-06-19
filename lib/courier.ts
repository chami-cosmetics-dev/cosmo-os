export function isCitypakCourier(name: string | null | undefined) {
  const normalized = name?.trim().toLowerCase() ?? "";
  return normalized.includes("citypak") || normalized.includes("citypack");
}

export function isRiderReturn(shippingServiceType: string | null | undefined) {
  return shippingServiceType?.trim().toLowerCase() === "rider";
}

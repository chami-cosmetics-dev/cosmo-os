export type LocationWithShadowSource = {
  id: string;
  shadowParentLocationId: string | null;
};

export function getShadowSourceLocationId(location: LocationWithShadowSource) {
  return location.shadowParentLocationId ?? location.id;
}

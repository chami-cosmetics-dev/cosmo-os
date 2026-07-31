import type { ContactFillBlanksPatch } from "@/lib/adapt-import/types";
import { LIMITS } from "@/lib/validation";

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function clip(value: string | null | undefined, max: number): string | null {
  const t = value?.trim() ?? "";
  if (!t) return null;
  return t.slice(0, max);
}

type ContactLike = {
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  district?: string | null;
  zone?: string | null;
  town?: string | null;
  remarks?: string | null;
  source?: string | null;
};

type AdaptFields = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  district?: string | null;
  zone?: string | null;
  nearestOutlet?: string | null;
  remarks?: string | null;
};

/** Build ContactMaster update patch — fill blanks only; never overwrite. */
export function buildContactFillBlanksPatch(
  existing: ContactLike | null,
  adapt: AdaptFields,
  options?: { setSourceAdaptOnCreate?: boolean }
): ContactFillBlanksPatch {
  const patch: ContactFillBlanksPatch = {};
  const name = clip(adapt.name, LIMITS.name.max);
  const email = clip(adapt.email?.toLowerCase(), LIMITS.email.max);
  const phone = clip(adapt.phone, LIMITS.mobile.max);
  const address = clip(adapt.address, LIMITS.address.max);
  const district = clip(adapt.district, LIMITS.locationName.max);
  const zone = clip(adapt.zone, LIMITS.locationName.max);
  const town = clip(adapt.nearestOutlet, LIMITS.locationName.max);
  const remarks = clip(adapt.remarks, LIMITS.description.max);

  if (!existing) {
    if (name) patch.name = name;
    if (email) patch.email = email;
    if (phone) patch.phoneNumber = phone;
    if (address) patch.address = address;
    if (district) patch.district = district;
    if (zone) patch.zone = zone;
    if (town) patch.town = town;
    if (remarks) patch.remarks = remarks;
    if (options?.setSourceAdaptOnCreate !== false) patch.source = "adapt";
    return patch;
  }

  if (isBlank(existing.name) && name) patch.name = name;
  if (isBlank(existing.email) && email) patch.email = email;
  if (isBlank(existing.phoneNumber) && phone) patch.phoneNumber = phone;
  if (isBlank(existing.address) && address) patch.address = address;
  if (isBlank(existing.district) && district) patch.district = district;
  if (isBlank(existing.zone) && zone) patch.zone = zone;
  if (isBlank(existing.town) && town) patch.town = town;
  if (isBlank(existing.remarks) && remarks) patch.remarks = remarks;
  if (isBlank(existing.source)) patch.source = "adapt";

  return patch;
}

export function hasFillBlanksChanges(patch: ContactFillBlanksPatch): boolean {
  return Object.keys(patch).length > 0;
}

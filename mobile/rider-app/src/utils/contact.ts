import { Alert, Linking } from "react-native";

import type { AddressLike } from "@/src/types/delivery";

export function getAddressText(input: {
  shippingAddress?: unknown;
  billingAddress?: unknown;
}) {
  const candidate = [input.shippingAddress, input.billingAddress].find(
    (value) => value && typeof value === "object"
  ) as AddressLike | undefined;

  if (!candidate) return "No address";

  const parts = [
    candidate.address1,
    candidate.address2,
    candidate.city,
    candidate.province,
    candidate.zip,
    candidate.country,
  ]
    .map((item) => item?.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "No address";
}

export async function openDirections(address: string) {
  if (!address || address === "No address") {
    Alert.alert("No address", "This delivery does not have a valid address for directions.");
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Maps unavailable", "No maps app is available on this phone.");
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open maps", "Please try again.");
  }
}

export async function openPhoneCall(phone: string | null | undefined) {
  const trimmedPhone = phone?.trim();
  if (!trimmedPhone) {
    Alert.alert("No phone number", "This customer does not have a phone number.");
    return;
  }

  try {
    await Linking.openURL(`tel:${trimmedPhone}`);
  } catch {
    Alert.alert("Unable to call", "Please try again.");
  }
}

export async function openSmsMessage(phone: string | null | undefined) {
  const trimmedPhone = phone?.trim();
  if (!trimmedPhone) {
    Alert.alert("No phone number", "This customer does not have a phone number for messages.");
    return;
  }

  try {
    await Linking.openURL(`sms:${trimmedPhone}`);
  } catch {
    Alert.alert("Unable to open messages", "Please try again.");
  }
}

import { Alert, Linking, Platform } from "react-native";

import type { AddressLike } from "@/src/types/delivery";
import { buildMapUrlCandidates, hasUsableAddress } from "@/src/utils/map-urls";

export { buildMapUrlCandidates, hasUsableAddress } from "@/src/utils/map-urls";

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

async function tryOpenUrl(url: string): Promise<boolean> {
  try {
    // HTTPS maps links often report canOpenURL=false on Android even when a browser can open them.
    if (url.startsWith("http://") || url.startsWith("https://")) {
      await Linking.openURL(url);
      return true;
    }
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function copyAddressToClipboard(address: string): Promise<boolean> {
  try {
    const clipboard = await import("expo-clipboard");
    await clipboard.setStringAsync(address);
    return true;
  } catch {
    return false;
  }
}

function showMapsFallback(address: string) {
  Alert.alert(
    "Could not open maps",
    Platform.OS === "android"
      ? "No maps app opened. You can copy the address and paste it into Maps or your browser."
      : "Maps could not be opened. You can copy the address and paste it into Maps.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Copy address",
        onPress: () => {
          void (async () => {
            const ok = await copyAddressToClipboard(address);
            Alert.alert(
              ok ? "Address copied" : "Copy failed",
              ok
                ? "Paste the address into any maps app."
                : "Could not copy. Please note the address on screen."
            );
          })();
        },
      },
    ]
  );
}

export async function openDirections(address: string) {
  if (!hasUsableAddress(address)) {
    Alert.alert("No address", "This delivery does not have a valid address for directions.");
    return;
  }

  const candidates = buildMapUrlCandidates(address);
  for (const url of candidates) {
    const opened = await tryOpenUrl(url);
    if (opened) return;
  }

  showMapsFallback(address);
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

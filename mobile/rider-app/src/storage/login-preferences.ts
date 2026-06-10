import AsyncStorage from "@react-native-async-storage/async-storage";

const REMEMBERED_EMAIL_KEY = "cosmo-rider-remembered-email";
const REMEMBERED_DEVICE_NAME_KEY = "cosmo-rider-remembered-device-name";

export type LoginPreferences = {
  email: string;
  deviceName: string;
};

export async function loadLoginPreferences(): Promise<LoginPreferences> {
  const [email, deviceName] = await Promise.all([
    AsyncStorage.getItem(REMEMBERED_EMAIL_KEY),
    AsyncStorage.getItem(REMEMBERED_DEVICE_NAME_KEY),
  ]);

  return {
    email: email?.trim() ?? "",
    deviceName: deviceName?.trim() ?? "",
  };
}

export async function saveLoginPreferences(params: {
  remember: boolean;
  email: string;
  deviceName: string;
}) {
  if (!params.remember) {
    await Promise.all([
      AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY),
      AsyncStorage.removeItem(REMEMBERED_DEVICE_NAME_KEY),
    ]);
    return;
  }

  const tasks: Promise<void>[] = [AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, params.email.trim())];

  const trimmedDeviceName = params.deviceName.trim();
  if (trimmedDeviceName) {
    tasks.push(AsyncStorage.setItem(REMEMBERED_DEVICE_NAME_KEY, trimmedDeviceName));
  } else {
    tasks.push(AsyncStorage.removeItem(REMEMBERED_DEVICE_NAME_KEY));
  }

  await Promise.all(tasks);
}

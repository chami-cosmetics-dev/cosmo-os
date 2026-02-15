import { prisma } from "@/lib/prisma";

function formatPhoneNumber(tpNo: string): string {
  const digits = tpNo.replace(/\D/g, "");

  if (digits.length === 9) {
    return "94" + digits;
  }
  if (digits.length === 10 && digits.startsWith("07")) {
    return "94" + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith("94")) {
    return digits;
  }
  if (digits.startsWith("94")) {
    return digits;
  }

  return "94" + digits.replace(/^0+/, "");
}

export type SendSmsResult =
  | { success: true }
  | { success: false; message: string };

export async function sendSms(
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string
): Promise<SendSmsResult> {
  const config = await prisma.smsPortalConfig.findUnique({
    where: { companyId },
  });

  if (!config) {
    return {
      success: false,
      message: "SMS portal not configured for this company",
    };
  }

  const formattedNumber = formatPhoneNumber(phoneNumber);

  try {
    const authResponse = await fetch(config.authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-API-VERSION": "v1",
      },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
      }),
    });

    const authData = (await authResponse.json()) as {
      accessToken?: string;
    };

    if (!authData.accessToken) {
      console.error("Hutch SMS: No access token in auth response", authData);
      return {
        success: false,
        message: "Failed to authenticate with SMS provider",
      };
    }

    const smsResponse = await fetch(config.smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-API-VERSION": "v1",
        Authorization: `Bearer ${authData.accessToken}`,
      },
      body: JSON.stringify({
        campaignName: config.campaignName,
        mask: config.smsMask,
        numbers: formattedNumber,
        content: message,
        deliveryReportRequest: false,
      }),
    });

    const smsData = (await smsResponse.json()) as {
      status?: string;
      result?: string;
      success?: boolean;
      error?: string;
      message?: string;
    };

    const statusLower = (smsData.status ?? smsData.result ?? "").toLowerCase();
    const isSuccess =
      statusLower === "success" ||
      statusLower === "sent" ||
      smsData.status === "SUCCESS" ||
      smsData.result === "SUCCESS" ||
      smsData.success === true ||
      (smsResponse.ok && !smsData.error && !smsData.message?.toLowerCase().includes("error"));

    if (isSuccess) {
      await prisma.smsLog.create({
        data: {
          companyId,
          phoneNumber,
          message,
          sentById: sentById ?? null,
          status: "sent",
        },
      });
      return { success: true };
    }

    return {
      success: false,
      message:
        smsData.error ??
        smsData.message ??
        "SMS provider did not accept the message",
    };
  } catch (error) {
    console.error("Hutch SMS send failed:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}

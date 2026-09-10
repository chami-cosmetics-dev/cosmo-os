import type { SmsPortalConfig } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Cache auth tokens per company for the duration of the serverless function execution.
// Avoids hammering the Hutch auth endpoint once per SMS during bulk dispatch.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const MAX_SEND_ATTEMPTS = 3;

/**
 * How long to stop calling Hutch after a login 401.
 *
 * Hutch blocks the API user when it sees a flood of failed logins, so we must back off.
 * But the pause has to lift on its own: it previously cleared only when someone re-saved
 * SMS Portal settings, which left Cosmo silently dark for hours after Hutch had already
 * restored the account (2026-09-09: account recovered 15:06, Cosmo stayed paused to 16:35).
 */
export const AUTH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Serialises the probe that follows a lifted cooldown, per company, within this process.
 * A bulk dispatch queues every message at once; without this each one would fire its own
 * login the moment the cooldown expires — the exact burst that gets the account blocked.
 * Cross-instance bursts still cost one probe per serverless instance, which is a handful
 * rather than one per message.
 */
const recoveryChains = new Map<string, Promise<unknown>>();

function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = recoveryChains.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  recoveryChains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** Timestamp of the most recent real login 401 since the credentials were last saved. */
async function lastAuth401At(companyId: string, since: Date): Promise<Date | null> {
  const row = await prisma.smsLog.findFirst({
    where: {
      companyId,
      status: "failed",
      sentAt: { gte: since },
      message: { contains: "Hutch login rejected (401" },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  return row?.sentAt ?? null;
}

function authPaused(remainingMs: number): SendSmsResult {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return {
    success: false,
    message:
      `SMS paused after Hutch login 401 — will retry automatically in ~${minutes} min. ` +
      "If it stays paused, update the SMS Portal password and run Test SMS.",
    retryable: false,
  };
}

type HutchAuthResult =
  | { ok: true; token: string }
  | { ok: false; message: string; retryable: boolean };

async function getHutchToken(config: {
  companyId: string;
  authUrl: string;
  username: string;
  password: string;
}): Promise<HutchAuthResult> {
  const cached = tokenCache.get(config.companyId);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, token: cached.token };

  const authResponse = await fetch(config.authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*", "X-API-VERSION": "v1" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });

  let authData: { accessToken?: string; error?: string; message?: string } = {};
  try {
    authData = (await authResponse.json()) as typeof authData;
  } catch {
    const retryable = authResponse.status >= 500 || authResponse.status === 429;
    return {
      ok: false,
      message: `Hutch login rejected (${authResponse.status} non-JSON body)`,
      retryable,
    };
  }

  if (!authResponse.ok || !authData.accessToken) {
    const detail =
      authData.error ?? authData.message ?? (authResponse.statusText || "no access token");
    console.error(`Hutch SMS login failed: ${authResponse.status} ${detail}`);
    return {
      ok: false,
      message: `Hutch login rejected (${authResponse.status} ${detail})`,
      retryable: authResponse.status >= 500 || authResponse.status === 429,
    };
  }

  // Cache for 4 minutes (tokens typically valid for 5+)
  tokenCache.set(config.companyId, {
    token: authData.accessToken,
    expiresAt: Date.now() + 4 * 60 * 1000,
  });
  return { ok: true, token: authData.accessToken };
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SendSmsResult =
  | { success: true }
  | { success: false; message: string; retryable?: boolean };

async function sendSmsOnce(
  config: SmsPortalConfig,
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string,
): Promise<SendSmsResult> {
  const formattedNumber = formatPhoneNumber(phoneNumber);

  try {
    const auth = await getHutchToken(config);

    if (!auth.ok) {
      tokenCache.delete(companyId);
      return { success: false, message: auth.message, retryable: auth.retryable };
    }
    const accessToken = auth.token;

    const smsResponse = await fetch(config.smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-API-VERSION": "v1",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        campaignName: config.campaignName,
        mask: config.smsMask,
        numbers: formattedNumber,
        content: message,
        deliveryReportRequest: false,
      }),
    });

    // Auth expired / rejected — clear cache so the next attempt re-auths
    if (smsResponse.status === 401 || smsResponse.status === 403) {
      tokenCache.delete(companyId);
      return { success: false, message: `SMS provider auth rejected (${smsResponse.status})` };
    }

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
    tokenCache.delete(companyId);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}

async function sendWithRetries(
  config: SmsPortalConfig,
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string,
): Promise<SendSmsResult> {
  let lastResult: SendSmsResult = {
    success: false,
    message: "Failed to send SMS",
  };

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    lastResult = await sendSmsOnce(config, companyId, phoneNumber, message, sentById);
    if (lastResult.success) return lastResult;

    // Don't retry permanent config / credential errors
    if (
      lastResult.message.includes("not configured") ||
      lastResult.retryable === false
    ) {
      break;
    }

    if (attempt < MAX_SEND_ATTEMPTS) {
      console.warn(
        `Hutch SMS attempt ${attempt}/${MAX_SEND_ATTEMPTS} failed for ${phoneNumber}: ${lastResult.message}`,
      );
      await sleep(250 * attempt);
    }
  }

  // Persist failures so missing rider SMS can be audited (previously only successes were logged)
  try {
    await prisma.smsLog.create({
      data: {
        companyId,
        phoneNumber,
        message: `[FAILED] ${lastResult.message} | ${message}`,
        sentById: sentById ?? null,
        status: "failed",
      },
    });
  } catch (logErr) {
    console.error("Hutch SMS: failed to write SmsLog for failed send:", logErr);
  }

  return lastResult;
}

export async function sendSms(
  companyId: string,
  phoneNumber: string,
  message: string,
  sentById?: string,
): Promise<SendSmsResult> {
  const config = await prisma.smsPortalConfig.findUnique({ where: { companyId } });
  if (!config) {
    return { success: false, message: "SMS portal not configured for this company" };
  }

  const last401 = await lastAuth401At(companyId, config.updatedAt);
  if (!last401) {
    return sendWithRetries(config, companyId, phoneNumber, message, sentById);
  }

  const remaining = AUTH_COOLDOWN_MS - (Date.now() - last401.getTime());
  if (remaining > 0) return authPaused(remaining);

  // Cooldown has lifted, so one send may probe Hutch. Anything queued behind the probe
  // re-reads the gate first: the probe's own failure row is written before this resolves,
  // so a still-broken account pauses the rest instead of each retrying its own login.
  return runExclusive(companyId, async () => {
    const fresh = await lastAuth401At(companyId, config.updatedAt);
    if (fresh) {
      const left = AUTH_COOLDOWN_MS - (Date.now() - fresh.getTime());
      if (left > 0) return authPaused(left);
    }
    return sendWithRetries(config, companyId, phoneNumber, message, sentById);
  });
}

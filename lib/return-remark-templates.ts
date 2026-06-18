export const RETURN_REMARK_TEMPLATE_CODES = ["UTC", "CR", "CNL", "POSTPONED", "CUSTOM"] as const;

export type ReturnRemarkTemplateCode = (typeof RETURN_REMARK_TEMPLATE_CODES)[number];

export const RETURN_REMARK_TEMPLATES = [
  { code: "UTC" as const, label: "Unable to Contact (UTC)" },
  { code: "CR" as const, label: "Customer Refuse (CR)" },
  { code: "CNL" as const, label: "Not at Location (CNL)" },
  { code: "POSTPONED" as const, label: "Postponed" },
  { code: "CUSTOM" as const, label: "Custom" },
] as const;

export function isReturnRemarkTemplateCode(value: string): value is ReturnRemarkTemplateCode {
  return (RETURN_REMARK_TEMPLATE_CODES as readonly string[]).includes(value);
}

export function getReturnRemarkTemplateLabel(code: string | null | undefined) {
  if (!code) return null;
  return RETURN_REMARK_TEMPLATES.find((item) => item.code === code)?.label ?? code;
}

export function buildReturnRemarkText(input: {
  remarkTemplate: ReturnRemarkTemplateCode;
  customRemark?: string | null;
}) {
  if (input.remarkTemplate === "CUSTOM") {
    return input.customRemark?.trim() || null;
  }
  const label = getReturnRemarkTemplateLabel(input.remarkTemplate);
  const custom = input.customRemark?.trim();
  if (custom) return `${label} — ${custom}`;
  return label;
}

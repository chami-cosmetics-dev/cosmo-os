import type { SyncContactMasterResult } from "@/lib/contact-master-sync";

export type OtherErpPhoneCheck = "clear" | "found" | "failed";

type ErpCustomerAutoAllocationInput = {
  syncStatus: SyncContactMasterResult["status"];
  creatorMer: string | null;
  creatorHasMerchantRole: boolean;
  originInstanceKnown: boolean;
  hasPhone: boolean;
  otherErpPhoneCheck: OtherErpPhoneCheck;
};

export function shouldAutoAllocateErpCustomer(
  input: ErpCustomerAutoAllocationInput,
): boolean {
  return (
    input.syncStatus === "created" &&
    Boolean(input.creatorMer) &&
    input.creatorHasMerchantRole &&
    input.originInstanceKnown &&
    input.hasPhone &&
    input.otherErpPhoneCheck === "clear"
  );
}

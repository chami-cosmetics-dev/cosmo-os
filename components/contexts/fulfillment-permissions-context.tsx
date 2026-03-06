"use client";

import { createContext, useContext } from "react";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";

const defaultPermissions: FulfillmentPermissions = {
  canManageSampleFreeIssue: false,
  canPrint: false,
  canPutOnHold: false,
  canMarkReady: false,
  canRevertHold: false,
  canDispatch: false,
  canMarkDelivered: false,
  canMarkInvoiceComplete: false,
  canManageRemarks: false,
  canResendRiderSms: false,
};

const FulfillmentPermissionsContext =
  createContext<FulfillmentPermissions>(defaultPermissions);

export function FulfillmentPermissionsProvider({
  permissions,
  children,
}: {
  permissions: FulfillmentPermissions;
  children: React.ReactNode;
}) {
  return (
    <FulfillmentPermissionsContext.Provider value={permissions}>
      {children}
    </FulfillmentPermissionsContext.Provider>
  );
}

export function useFulfillmentPermissions() {
  return useContext(FulfillmentPermissionsContext);
}

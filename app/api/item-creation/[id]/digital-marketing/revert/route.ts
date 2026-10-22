import { runItemCreationAction } from "@/app/api/item-creation/action-route";
import {
  ITEM_CREATION_PERMISSIONS,
  revertDigitalMarketingStage,
} from "@/lib/item-creation/workflow";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return runItemCreationAction(
    params,
    [
      ITEM_CREATION_PERMISSIONS.manageAll,
      ITEM_CREATION_PERMISSIONS.digitalMarketing,
      ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin,
    ],
    revertDigitalMarketingStage,
  );
}

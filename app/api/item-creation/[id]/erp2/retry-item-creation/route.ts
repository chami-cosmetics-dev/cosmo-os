import { runItemCreationAction } from "@/app/api/item-creation/action-route";
import { retryErp2ItemCreation } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runItemCreationAction(
    params,
    [ITEM_CREATION_PERMISSIONS.admin],
    (context, id) => retryErp2ItemCreation(context, id)
  );
}

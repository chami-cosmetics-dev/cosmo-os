import { runItemCreationAction } from "@/app/api/item-creation/action-route";
import { ITEM_CREATION_PERMISSIONS, markDigitalImageCreated } from "@/lib/item-creation/workflow";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return runItemCreationAction(
    params,
    [ITEM_CREATION_PERMISSIONS.admin, ITEM_CREATION_PERMISSIONS.digitalMarketing],
    (context, id, body) => markDigitalImageCreated(context, id, String((body as { imageDriveUrl?: string }).imageDriveUrl ?? "")),
    request
  );
}

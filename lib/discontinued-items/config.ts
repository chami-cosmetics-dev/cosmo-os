/** Discontinued Items → Item Drafting: tabs, labels and the permission each tab needs. */

export const DISCONTINUED_ITEMS_PERMISSIONS = {
  purchasingApproval: "discontinued_items.purchasing_approval.read",
  shopifyDraft: "discontinued_items.shopify_draft.read",
  /** Every tab, plus Download. */
  manager: "discontinued_items.manager",
} as const;

export const ITEM_DRAFTING_TABS = ["dashboard", "purchasing_approval", "shopify_draft"] as const;
export type ItemDraftingTab = (typeof ITEM_DRAFTING_TABS)[number];

export const ITEM_DRAFTING_TAB_LABELS: Record<ItemDraftingTab, string> = {
  dashboard: "Dashboard",
  purchasing_approval: "Purchasing Approval",
  shopify_draft: "Shopify Draft",
};

export type ItemDraftingAccess = {
  canPurchasingApproval: boolean;
  canShopifyDraft: boolean;
  /** Manager: sees every tab and may download. */
  isManager: boolean;
  /** May click the Purchasing Approval ERP buttons (the tab's own permission; not Manager alone). */
  canActPurchasingApproval: boolean;
  /** May upload the Search Console report, edit links and click Draft (not Manager alone). */
  canActShopifyDraft: boolean;
};

/** Resolves access from the user's permission keys (Manager implies viewing both tabs). */
export function resolveItemDraftingAccess(has: (key: string) => boolean): ItemDraftingAccess {
  const isManager = has(DISCONTINUED_ITEMS_PERMISSIONS.manager);
  return {
    isManager,
    canActPurchasingApproval: has(DISCONTINUED_ITEMS_PERMISSIONS.purchasingApproval),
    canActShopifyDraft: has(DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft),
    canPurchasingApproval: isManager || has(DISCONTINUED_ITEMS_PERMISSIONS.purchasingApproval),
    canShopifyDraft: isManager || has(DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft),
  };
}

/**
 * Tabs the user may open, in display order. Dashboard is open to anyone who can reach the
 * screen; the other two need their own permission (or Manager).
 */
export function visibleItemDraftingTabs(access: ItemDraftingAccess): ItemDraftingTab[] {
  if (!access.canPurchasingApproval && !access.canShopifyDraft) return [];
  return ITEM_DRAFTING_TABS.filter((tab) => {
    if (tab === "purchasing_approval") return access.canPurchasingApproval;
    if (tab === "shopify_draft") return access.canShopifyDraft;
    return true;
  });
}

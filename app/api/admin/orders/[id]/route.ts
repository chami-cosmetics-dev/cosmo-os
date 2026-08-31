import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  ORDER_CANCEL_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  PAYMENT_METHOD_CHANGE_APPROVAL,
} from "@/lib/approval-workflow";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { resolveOrderDiscountCouponForOrder, resolveOrderMerchantCouponForOrder } from "@/lib/order-discount-coupon";
import { resolveOrderErpSpecialRemarksForOrder } from "@/lib/order-erp-special-remarks";
import {
  resolveOrderDiscountTotal,
  resolveOrderLineItemsPricing,
  sumOriginalTotals,
} from "@/lib/order-line-item-pricing";
import { summarizeOrderPayments } from "@/lib/order-payment-entries";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";
import {
  getErpWebhookCustomerNameField,
  resolveErpApiCreds,
  resolveErpCustomerNameLive,
  resolveStoredOrderCustomerName,
} from "@/lib/erpnext-customer-display-name";
import { resolveOrderShippingDisplayForOrder } from "@/lib/order-shipping-display";
import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const orderSelect = {
  id: true,
  shopifyOrderId: true,
  orderNumber: true,
  name: true,
  erpnextInvoiceId: true,
  erpReturnSalesInvoiceIds: true,
  sourceName: true,
  totalPrice: true,
  subtotalPrice: true,
  totalDiscounts: true,
  totalTax: true,
  totalShipping: true,
  shippingLines: true,
  currency: true,
  financialStatus: true,
  fulfillmentStatus: true,
  customerEmail: true,
  customerPhone: true,
  shippingAddress: true,
  billingAddress: true,
  discountCodes: true,
  rawPayload: true,
  createdAt: true,
  fulfillmentStage: true,
  fulfillmentStageEnteredAt: true,
  printCount: true,
  packageReadyAt: true,
  packageOnHoldAt: true,
  dispatchedAt: true,
  dispatchedToCustomer: true,
  invoiceCompleteAt: true,
  deliveryCompleteAt: true,
  lastPrintedAt: true,
  sampleFreeIssueCompleteAt: true,
  sampleFreeIssueSendLaterDate: true,
  companyLocation: {
    select: {
      id: true,
      name: true,
      shopifyShopName: true,
      shopifyAdminStoreHandle: true,
      erpnextCompany: true,
      erpnextWarehouse: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  },
  assignedMerchant: { select: { id: true, name: true, email: true, couponCodes: true } },
  packageHoldReason: { select: { id: true, name: true } },
  packageReadyBy: { select: { id: true, name: true, email: true } },
  dispatchedBy: { select: { id: true, name: true, email: true } },
  dispatchedByRider: { select: { id: true, name: true, mobile: true } },
  dispatchedByCourierService: { select: { id: true, name: true } },
  invoiceCompleteBy: { select: { id: true, name: true, email: true } },
  deliveryCompleteBy: { select: { id: true, name: true, email: true } },
  lastPrintedBy: { select: { id: true, name: true, email: true } },
  sampleFreeIssueCompleteBy: { select: { id: true, name: true, email: true } },
  sampleFreeIssues: {
    include: {
      sampleFreeIssueItem: { select: { id: true, name: true, type: true } },
      addedBy: { select: { id: true, name: true, email: true } },
    },
  },
  returns: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      returnDate: true,
      dispatchedAt: true,
      shippingServiceType: true,
      shippingServiceName: true,
      actionStatus: true,
      actionRemark: true,
      actionDate: true,
      createdAt: true,
      returnedBy: { select: { id: true, name: true, email: true } },
      actionBy: { select: { id: true, name: true, email: true } },
    },
  },
  exchangesAsOriginal: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      status: true,
      remark: true,
      actionDate: true,
      createdAt: true,
      originalReference: true,
      replacementReference: true,
      replacementOrder: {
        select: { id: true, name: true, orderNumber: true, erpnextInvoiceId: true },
      },
    },
  },
  exchangesAsReplacement: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      status: true,
      remark: true,
      actionDate: true,
      createdAt: true,
      originalReference: true,
      replacementReference: true,
      originalOrder: {
        select: { id: true, name: true, orderNumber: true },
      },
    },
  },
  remarks: {
    orderBy: { createdAt: "desc" },
    include: { addedBy: { select: { id: true, name: true, email: true } } },
  },
  cancelledAt: true,
  cancelReason: true,
  cancelKind: true,
  cancelledBy: { select: { id: true, name: true, email: true } },
  replacedByOrderId: true,
  replacedByOrder: {
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
    },
  },
  replacedFromOrders: {
    orderBy: { cancelledAt: "desc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
      cancelledAt: true,
    },
  },
  approvalRequests: {
    where: {
      type: {
        in: [
          ORDER_PAYMENT_APPROVAL,
          DELIVERY_PAYMENT_APPROVAL,
          ORDER_CANCEL_APPROVAL,
          PAYMENT_METHOD_CHANGE_APPROVAL,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      requestNote: true,
      createdAt: true,
      reviewedAt: true,
      reviewNote: true,
      reviewedBy: { select: { id: true, name: true, email: true } },
      paymentLines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          erpPaymentEntryName: true,
        },
      },
    },
  },
  lineItems: {
    include: {
      productItem: {
        select: {
          id: true,
          productTitle: true,
          variantTitle: true,
          sku: true,
          productType: true,
          vendor: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  },
  deliveryPayment: {
    select: {
      id: true,
      expectedAmount: true,
      collectedAmount: true,
      customerGaveAmount: true,
      changeAmount: true,
      paymentMethod: true,
      collectionStatus: true,
      referenceNote: true,
      bankReference: true,
      cardReference: true,
      collectedAt: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          paymentMethod: true,
          amount: true,
          bankReference: true,
          cardReference: true,
          referenceNote: true,
          erpPaymentEntryName: true,
        },
      },
      cashHandover: {
        select: {
          id: true,
          handoverDate: true,
          status: true,
          totalHandedOverCash: true,
        },
      },
    },
  },
  paymentEntries: {
    orderBy: [{ postingDate: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      paymentEntryId: true,
      paymentType: true,
      modeOfPayment: true,
      amount: true,
      allocatedAmount: true,
      postingDate: true,
    },
  },
  riderDeliveryTask: {
    select: {
      id: true,
      status: true,
      assignedAt: true,
      acceptedAt: true,
      arrivedAt: true,
      completedAt: true,
      failedAt: true,
      failureReason: true,
      latestSyncAt: true,
    },
  },
  deliveryOutcome: true,
  deliveryFailedReason: true,
} satisfies Prisma.OrderSelect;

type OrderWithDetails = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.sample_free_issue.read",
    "fulfillment.order_print.read",
    "fulfillment.ready_dispatch.read",
    "fulfillment.delivery_invoice.read",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const gatewayColumns = await getOrderPaymentGatewayColumnState();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      ...orderSelect,
      ...(gatewayColumns.hasPaymentGatewayNames ? { paymentGatewayNames: true } : {}),
      ...(gatewayColumns.hasPaymentGatewayPrimary ? { paymentGatewayPrimary: true } : {}),
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const details = order as OrderWithDetails &
    Partial<{
      paymentGatewayNames: string[];
      paymentGatewayPrimary: string | null;
    }>;

  let customerName = resolveStoredOrderCustomerName({
    shippingAddress: details.shippingAddress,
    billingAddress: details.billingAddress,
    rawPayload: details.rawPayload,
  });
  let customerNameSource: "stored" | "erp_customer_api" | null = customerName ? "stored" : null;
  const erpWebhookCustomerName = getErpWebhookCustomerNameField(details.rawPayload);

  if (
    !customerName &&
    details.sourceName?.startsWith("erpnext")
  ) {
    const creds = resolveErpApiCreds(details.companyLocation.erpnextInstance);
    if (creds) {
      customerName = await resolveErpCustomerNameLive(creds, {
        rawPayload: details.rawPayload,
        shippingAddress: details.shippingAddress,
        name: details.name,
        erpnextInvoiceId: details.erpnextInvoiceId,
      });
      if (customerName) customerNameSource = "erp_customer_api";
    }
  }

  const shippingDisplay = await resolveOrderShippingDisplayForOrder({
    totalShipping: details.totalShipping?.toString() ?? null,
    shippingLines: details.shippingLines,
    rawPayload: details.rawPayload,
    sourceName: details.sourceName,
    name: details.name,
    erpnextInvoiceId: details.erpnextInvoiceId,
    erpnextInstance: details.companyLocation.erpnextInstance,
    discountCodes: details.discountCodes,
  });

  const discountCouponCode = await resolveOrderDiscountCouponForOrder({
    sourceName: details.sourceName,
    discountCodes: details.discountCodes,
    rawPayload: details.rawPayload,
    name: details.name,
    erpnextInvoiceId: details.erpnextInvoiceId,
    erpnextInstance: details.companyLocation.erpnextInstance,
  });

  const merchantCouponCode = await resolveOrderMerchantCouponForOrder({
    sourceName: details.sourceName,
    discountCodes: details.discountCodes,
    rawPayload: details.rawPayload,
    assignedMerchantCouponCodes: details.assignedMerchant?.couponCodes ?? null,
    erpnextInvoiceId: details.erpnextInvoiceId,
    erpnextInstance: details.companyLocation.erpnextInstance,
  });

  const erpSpecialRemarks = await resolveOrderErpSpecialRemarksForOrder({
    sourceName: details.sourceName,
    rawPayload: details.rawPayload,
    name: details.name,
    erpnextInvoiceId: details.erpnextInvoiceId,
    erpnextInstance: details.companyLocation.erpnextInstance,
  });

  const lineItemsBase = details.lineItems.map((li) => ({
    sku: li.productItem.sku,
    quantity: li.quantity,
    price: li.price.toString(),
  }));

  const linePricing = await resolveOrderLineItemsPricing({
    sourceName: details.sourceName,
    rawPayload: details.rawPayload,
    name: details.name,
    erpnextInvoiceId: details.erpnextInvoiceId,
    erpnextInstance: details.companyLocation.erpnextInstance,
    lineItems: lineItemsBase,
  });

  const lineItems = details.lineItems.map((li, index) => {
    const pricing = linePricing[index];
    return {
      id: li.id,
      productTitle: li.productItem.productTitle,
      variantTitle: li.productItem.variantTitle,
      sku: li.productItem.sku,
      brand: li.productItem.vendor?.name ?? null,
      category: li.productItem.category?.name ?? null,
      subCategory: li.productItem.productType ?? null,
      quantity: li.quantity,
      price: pricing?.salePrice ?? li.price.toString(),
      total: pricing?.saleTotal ?? (Number(li.price) * li.quantity).toFixed(2),
      originalPrice: pricing?.originalPrice ?? null,
      originalTotal: pricing?.originalTotal ?? null,
      lineDiscount: pricing?.lineDiscount ?? null,
    };
  });

  const discountTotal = resolveOrderDiscountTotal({
    totalDiscounts: details.totalDiscounts?.toString() ?? null,
    linePricing,
    discountCouponCode: discountCouponCode ?? null,
  });
  const subtotalOriginal = sumOriginalTotals(linePricing);
  const subtotalSale =
    details.subtotalPrice?.toString() ??
    linePricing
      .reduce((acc, row) => acc + parseFloat(row.saleTotal), 0)
      .toFixed(2);
  const paymentSummary = summarizeOrderPayments(
    details.paymentEntries,
    Number(details.totalPrice),
  );

  return NextResponse.json({
    id: details.id,
    shopifyOrderId: details.shopifyOrderId,
    orderNumber: details.orderNumber,
    name: details.name,
    sourceName: details.sourceName,
    totalPrice: details.totalPrice.toString(),
    subtotalPrice: details.subtotalPrice?.toString() ?? subtotalSale,
    subtotalOriginal,
    subtotalSale,
    discountTotal,
    totalDiscounts: discountTotal ?? details.totalDiscounts?.toString() ?? null,
    totalTax: details.totalTax?.toString() ?? null,
    totalShipping: shippingDisplay.amount ?? details.totalShipping?.toString() ?? null,
    shippingRuleLabel: shippingDisplay.label,
    currency: details.currency,
    financialStatus: details.financialStatus,
    fulfillmentStatus: details.fulfillmentStatus,
    paymentGatewayNames: gatewayColumns.hasPaymentGatewayNames
      ? (details.paymentGatewayNames ?? [])
      : [],
    paymentGatewayPrimary: gatewayColumns.hasPaymentGatewayPrimary
      ? (details.paymentGatewayPrimary ?? null)
      : null,
    payments: details.paymentEntries.map((payment) => ({
      paymentEntryId: payment.paymentEntryId,
      paymentType: payment.paymentType,
      modeOfPayment: payment.modeOfPayment,
      amount: payment.amount.toString(),
      allocatedAmount: payment.allocatedAmount.toString(),
      postingDate: payment.postingDate.toISOString(),
    })),
    paymentSummary:
      details.paymentEntries.length > 0
        ? {
            incomingPaid: paymentSummary.incomingPaid.toFixed(2),
            refundedAmount: paymentSummary.refunds.toFixed(2),
            totalPaid: paymentSummary.netPaid.toFixed(2),
            balance: paymentSummary.balance.toFixed(2),
          }
        : null,
    customerEmail: details.customerEmail,
    customerPhone: details.customerPhone,
    customerName,
    erpWebhookCustomerName,
    customerNameSource,
    resolvedCustomerPhone:
      resolveCustomerPhone({
        customerPhone: details.customerPhone,
        shippingAddress: details.shippingAddress,
        billingAddress: details.billingAddress,
        rawPayload: details.rawPayload,
      }) ?? null,
    shippingAddress: details.shippingAddress,
    billingAddress: details.billingAddress,
    discountCodes: details.discountCodes,
    merchantCouponCode,
    discountCouponCode,
    erpSpecialRemarks,
    erpReturnSalesInvoiceIds: details.erpReturnSalesInvoiceIds ?? [],
    createdAt: details.createdAt.toISOString(),
    companyLocation: details.companyLocation,
    assignedMerchant: details.assignedMerchant,
    lineItems,
    shopifyAdminOrderUrl: (() => {
      if (details.sourceName === "manual" || details.shopifyOrderId.startsWith("manual-")) {
        return null;
      }
      const handle =
        details.companyLocation.shopifyAdminStoreHandle ??
        details.companyLocation.shopifyShopName;
      return handle
        ? `https://admin.shopify.com/store/${handle}/orders/${details.shopifyOrderId}`
        : null;
    })(),
    erpAdminInvoiceUrl: (() => {
      const baseUrl = details.companyLocation.erpnextInstance?.baseUrl?.replace(/\/$/, "");
      if (!baseUrl) return null;
      const isErpSource = details.sourceName?.startsWith("erpnext");
      if (isErpSource && details.name) {
        return `${baseUrl}/app/sales-invoice/${encodeURIComponent(details.name)}`;
      }
      if (details.erpnextInvoiceId) {
        return `${baseUrl}/app/sales-invoice/${encodeURIComponent(details.erpnextInvoiceId)}`;
      }
      return null;
    })(),
    fulfillmentStage: details.fulfillmentStage,
    fulfillmentStageEnteredAt: details.fulfillmentStageEnteredAt?.toISOString() ?? null,
    printCount: details.printCount,
    packageReadyAt: details.packageReadyAt?.toISOString() ?? null,
    packageReadyBy: details.packageReadyBy
      ? {
          id: details.packageReadyBy.id,
          name: details.packageReadyBy.name,
          email: details.packageReadyBy.email,
        }
      : null,
    packageOnHoldAt: details.packageOnHoldAt?.toISOString() ?? null,
    packageHoldReason: details.packageHoldReason,
    dispatchedAt: details.dispatchedAt?.toISOString() ?? null,
    dispatchedBy: details.dispatchedBy
      ? {
          id: details.dispatchedBy.id,
          name: details.dispatchedBy.name,
          email: details.dispatchedBy.email,
        }
      : null,
    dispatchedByRider: details.dispatchedByRider,
    dispatchedByCourierService: details.dispatchedByCourierService,
    dispatchedToCustomer: details.dispatchedToCustomer,
    invoiceCompleteAt: details.invoiceCompleteAt?.toISOString() ?? null,
    invoiceCompleteBy: details.invoiceCompleteBy
      ? {
          id: details.invoiceCompleteBy.id,
          name: details.invoiceCompleteBy.name,
          email: details.invoiceCompleteBy.email,
        }
      : null,
    deliveryCompleteAt: details.deliveryCompleteAt?.toISOString() ?? null,
    deliveryCompleteBy: details.deliveryCompleteBy
      ? {
          id: details.deliveryCompleteBy.id,
          name: details.deliveryCompleteBy.name,
          email: details.deliveryCompleteBy.email,
        }
      : null,
    lastPrintedAt: details.lastPrintedAt?.toISOString() ?? null,
    lastPrintedBy: details.lastPrintedBy
      ? {
          id: details.lastPrintedBy.id,
          name: details.lastPrintedBy.name,
          email: details.lastPrintedBy.email,
        }
      : null,
    sampleFreeIssueCompleteAt: details.sampleFreeIssueCompleteAt?.toISOString() ?? null,
    sampleFreeIssueSendLaterDate: details.sampleFreeIssueSendLaterDate?.toISOString() ?? null,
    sampleFreeIssueCompleteBy: details.sampleFreeIssueCompleteBy
      ? {
          id: details.sampleFreeIssueCompleteBy.id,
          name: details.sampleFreeIssueCompleteBy.name,
          email: details.sampleFreeIssueCompleteBy.email,
        }
      : null,
    sampleFreeIssues: details.sampleFreeIssues.map((s) => ({
      id: s.id,
      sampleFreeIssueItem: s.sampleFreeIssueItem,
      quantity: s.quantity,
      createdAt: s.createdAt.toISOString(),
      addedBy: s.addedBy ? { id: s.addedBy.id, name: s.addedBy.name, email: s.addedBy.email } : null,
    })),
    returns: details.returns.map((r) => ({
      id: r.id,
      reason: "Returned Orders",
      returnDate: r.returnDate.toISOString(),
      dispatchedAt: r.dispatchedAt.toISOString(),
      shippingServiceType: r.shippingServiceType,
      shippingServiceName: r.shippingServiceName,
      actionStatus: r.actionStatus,
      actionRemark: r.actionRemark,
      actionDate: r.actionDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      returnedBy: r.returnedBy
        ? { id: r.returnedBy.id, name: r.returnedBy.name, email: r.returnedBy.email }
        : null,
      actionBy: r.actionBy
        ? { id: r.actionBy.id, name: r.actionBy.name, email: r.actionBy.email }
        : null,
    })),
    remarks: details.remarks.map((r) => ({
      id: r.id,
      stage: r.stage,
      type: r.type,
      content: r.content,
      showOnInvoice: r.showOnInvoice,
      createdAt: r.createdAt.toISOString(),
      addedBy: r.addedBy ? { id: r.addedBy.id, name: r.addedBy.name, email: r.addedBy.email } : null,
    })),
    exchanges: [
      ...details.exchangesAsOriginal.map((e) => {
        const erpBase = details.companyLocation.erpnextInstance?.baseUrl?.replace(/\/$/, "");
        const repInvoiceId = e.replacementOrder?.erpnextInvoiceId;
        const replacementErpAdminInvoiceUrl =
          erpBase && repInvoiceId && !["pending", "pending_approval"].includes(repInvoiceId)
            ? `${erpBase}/app/sales-invoice/${encodeURIComponent(repInvoiceId)}`
            : null;
        return {
          id: e.id,
          role: "original" as const,
          reason: e.reason,
          status: e.status,
          remark: e.remark,
          actionDate: e.actionDate?.toISOString() ?? null,
          createdAt: e.createdAt.toISOString(),
          originalReference: e.originalReference,
          replacementReference: e.replacementReference,
          linkedOrderId: e.replacementOrder?.id ?? null,
          linkedOrderName: e.replacementOrder?.name ?? e.replacementReference,
          replacementErpAdminInvoiceUrl,
        };
      }),
      ...details.exchangesAsReplacement.map((e) => ({
        id: e.id,
        role: "replacement" as const,
        reason: e.reason,
        status: e.status,
        remark: e.remark,
        actionDate: e.actionDate?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        originalReference: e.originalReference,
        replacementReference: e.replacementReference,
        linkedOrderId: e.originalOrder?.id ?? null,
        linkedOrderName: e.originalOrder?.name ?? e.originalReference,
        replacementErpAdminInvoiceUrl: null,
      })),
    ],
    paymentApproval: (() => {
      const ap = details.approvalRequests.find((row) => row.type === ORDER_PAYMENT_APPROVAL);
      if (!ap) return null;
      return {
        id: ap.id,
        status: ap.status,
        requestNote: ap.requestNote ?? null,
        createdAt: ap.createdAt.toISOString(),
        reviewedAt: ap.reviewedAt?.toISOString() ?? null,
        reviewNote: ap.reviewNote ?? null,
        reviewedBy: ap.reviewedBy ? { id: ap.reviewedBy.id, name: ap.reviewedBy.name, email: ap.reviewedBy.email } : null,
        paymentLines: ap.paymentLines.map((line) => ({
          id: line.id,
          paymentMethod: line.paymentMethod,
          amount: line.amount.toString(),
          erpPaymentEntryName: line.erpPaymentEntryName,
        })),
      };
    })(),
    deliveryPaymentApproval: (() => {
      const ap = details.approvalRequests.find((row) => row.type === DELIVERY_PAYMENT_APPROVAL);
      if (!ap) return null;
      return {
        id: ap.id,
        status: ap.status,
        requestNote: ap.requestNote ?? null,
        createdAt: ap.createdAt.toISOString(),
        reviewedAt: ap.reviewedAt?.toISOString() ?? null,
        reviewNote: ap.reviewNote ?? null,
        reviewedBy: ap.reviewedBy ? { id: ap.reviewedBy.id, name: ap.reviewedBy.name, email: ap.reviewedBy.email } : null,
      };
    })(),
    deliveryPayment: details.deliveryPayment
      ? {
          id: details.deliveryPayment.id,
          expectedAmount: details.deliveryPayment.expectedAmount.toString(),
          collectedAmount: details.deliveryPayment.collectedAmount.toString(),
          customerGaveAmount: details.deliveryPayment.customerGaveAmount?.toString() ?? null,
          changeAmount: details.deliveryPayment.changeAmount?.toString() ?? null,
          paymentMethod: details.deliveryPayment.paymentMethod,
          collectionStatus: details.deliveryPayment.collectionStatus,
          referenceNote: details.deliveryPayment.referenceNote,
          bankReference: details.deliveryPayment.bankReference,
          cardReference: details.deliveryPayment.cardReference,
          collectedAt: details.deliveryPayment.collectedAt?.toISOString() ?? null,
          lines: details.deliveryPayment.lines.map((line) => ({
            paymentMethod: line.paymentMethod,
            amount: line.amount.toString(),
            bankReference: line.bankReference,
            cardReference: line.cardReference,
            referenceNote: line.referenceNote,
            erpPaymentEntryName: line.erpPaymentEntryName,
          })),
          cashHandover: details.deliveryPayment.cashHandover
            ? {
                id: details.deliveryPayment.cashHandover.id,
                handoverDate: details.deliveryPayment.cashHandover.handoverDate.toISOString(),
                status: details.deliveryPayment.cashHandover.status,
                totalHandedOverCash: details.deliveryPayment.cashHandover.totalHandedOverCash.toString(),
              }
            : null,
        }
      : null,
    riderDeliveryTask: details.riderDeliveryTask
      ? {
          id: details.riderDeliveryTask.id,
          status: details.riderDeliveryTask.status,
          assignedAt: details.riderDeliveryTask.assignedAt.toISOString(),
          acceptedAt: details.riderDeliveryTask.acceptedAt?.toISOString() ?? null,
          arrivedAt: details.riderDeliveryTask.arrivedAt?.toISOString() ?? null,
          completedAt: details.riderDeliveryTask.completedAt?.toISOString() ?? null,
          failedAt: details.riderDeliveryTask.failedAt?.toISOString() ?? null,
          failureReason: details.riderDeliveryTask.failureReason,
          latestSyncAt: details.riderDeliveryTask.latestSyncAt?.toISOString() ?? null,
        }
      : null,
    deliveryOutcome: details.deliveryOutcome,
    deliveryFailedReason: details.deliveryFailedReason,
    methodChangeApproval: (() => {
      const ap = details.approvalRequests.find((row) => row.type === PAYMENT_METHOD_CHANGE_APPROVAL);
      if (!ap) return null;
      return {
        id: ap.id,
        status: ap.status,
        requestNote: ap.requestNote ?? null,
        createdAt: ap.createdAt.toISOString(),
        reviewedAt: ap.reviewedAt?.toISOString() ?? null,
        reviewNote: ap.reviewNote ?? null,
        reviewedBy: ap.reviewedBy ? { id: ap.reviewedBy.id, name: ap.reviewedBy.name, email: ap.reviewedBy.email } : null,
      };
    })(),
    cancelledAt: details.cancelledAt?.toISOString() ?? null,
    cancelledBy: details.cancelledBy
      ? { id: details.cancelledBy.id, name: details.cancelledBy.name, email: details.cancelledBy.email }
      : null,
    cancelReason: details.cancelReason ?? null,
    cancelKind: details.cancelKind ?? null,
    hasPendingCancelApproval: details.approvalRequests.some(
      (a) => a.type === ORDER_CANCEL_APPROVAL && a.status === "pending"
    ),
    replacedByOrder: details.replacedByOrder
      ? {
          id: details.replacedByOrder.id,
          orderLabel: formatBusinessOrderNumber(details.replacedByOrder),
          name: details.replacedByOrder.name,
          orderNumber: details.replacedByOrder.orderNumber,
          erpnextInvoiceId: details.replacedByOrder.erpnextInvoiceId,
        }
      : null,
    replacedFromOrders: details.replacedFromOrders.map((row) => ({
      id: row.id,
      orderLabel: formatBusinessOrderNumber(row),
      name: row.name,
      orderNumber: row.orderNumber,
      erpnextInvoiceId: row.erpnextInvoiceId,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    })),
  });
}

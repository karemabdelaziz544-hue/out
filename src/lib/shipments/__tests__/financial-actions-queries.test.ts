import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  addFinancialInternalNoteAction,
  cancelCustomsObligationAction,
  completeStage9FinancialSettlementAction,
  createCustomsObligationAction,
  recordCustomerChargeOrCreditAction,
  recordCustomerDirectCustomsPaymentAction,
  recordCustomerPaymentToOutAction,
  recordOutDisbursementAction,
  rejectFinancialTransactionAction,
  reverseFinancialTransactionAction,
  updateCustomsObligationAction,
  verifyCustomerDirectCustomsPaymentAction,
} from "../financial-actions";
import {
  getCustomerShipmentFinancialStatementQuery,
  getShipmentCustomsObligationsQuery,
  getShipmentFinancialInternalNotesQuery,
  getShipmentFinancialSummaryQuery,
  getShipmentFinancialTransactionsQuery,
  getShipmentReversedTransactionsAuditQuery,
  getStage9FinancialGateStatusQuery,
  type VerifiedFinancialActor,
} from "../financial-queries";
import {
  buildCustomerFinancialStatement,
  calculateShipmentFinancialSummary,
  deriveSingleObligationCoverageStatus,
} from "../financial-calculations";
import type {
  ShipmentCustomsObligationRow,
  ShipmentFinancialInternalNoteRow,
  ShipmentFinancialTransactionRow,
} from "../../../types/financial";

// ─── In-Memory Stateful Mock Database (Mirrors Migration 0019 Behavior) ───────

const SHIPMENT_A_ID = "11111111-1111-4111-8111-111111111111";
const SHIPMENT_B_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC_RECEIPT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC_SHIPMENT_B_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ACTORS: Record<string, VerifiedFinancialActor> = {
  admin: {
    id: "90000000-0000-4000-8000-000000000001",
    email: "admin@out.eg",
    fullName: "مدير النظام",
    role: "admin",
    isActive: true,
    provisioningStatus: "active",
    companyId: null,
  },
  manager: {
    id: "90000000-0000-4000-8000-000000000002",
    email: "manager@out.eg",
    fullName: "مدير العمليات",
    role: "manager",
    isActive: true,
    provisioningStatus: "active",
    companyId: null,
  },
  scout: {
    id: "90000000-0000-4000-8000-000000000003",
    email: "scout@out.eg",
    fullName: "كشاف ميداني",
    role: "scout",
    isActive: true,
    provisioningStatus: "active",
    companyId: null,
  },
  inspector: {
    id: "90000000-0000-4000-8000-000000000004",
    email: "inspector@out.eg",
    fullName: "معاين جمركي",
    role: "inspector",
    isActive: true,
    provisioningStatus: "active",
    companyId: null,
  },
  data_entry: {
    id: "90000000-0000-4000-8000-000000000005",
    email: "data@out.eg",
    fullName: "مدرج بيانات",
    role: "data_entry",
    isActive: true,
    provisioningStatus: "active",
    companyId: null,
  },
  customerA: {
    id: "90000000-0000-4000-8000-000000000006",
    email: "customerA@companyA.eg",
    fullName: "عميل أ",
    role: "customer",
    isActive: true,
    provisioningStatus: "active",
    companyId: COMPANY_A_ID,
  },
  customerSameCompanyColleague: {
    id: "90000000-0000-4000-8000-000000000007",
    email: "colleague@companyA.eg",
    fullName: "مستخدم آخر بنفس الشركة",
    role: "customer",
    isActive: true,
    provisioningStatus: "active",
    companyId: COMPANY_A_ID,
  },
  customerB: {
    id: "90000000-0000-4000-8000-000000000008",
    email: "customerB@companyB.eg",
    fullName: "عميل ب",
    role: "customer",
    isActive: true,
    provisioningStatus: "active",
    companyId: COMPANY_B_ID,
  },
};

function createStatefulMockSupabase(options?: {
  pricingStatus?: "customer_approved" | "proposed";
  pricingApprovalType?: "final_fixed" | "estimated_range";
  finalPrice?: number | null;
  includePrerequisites?: boolean;
}) {
  let idSeq = 1;
  const nextUuid = () => {
    const hex = String(idSeq++).padStart(12, "0");
    return `77777777-7777-4777-8777-${hex}`;
  };

  const includePrereqs = options?.includePrerequisites !== false;

  const shipments = [
    {
      id: SHIPMENT_A_ID,
      customer_id: ACTORS.customerA.id,
      company_id: COMPANY_A_ID,
      status: "customs_in_progress",
      reference_number: "SHP-2026-001",
    },
    {
      id: SHIPMENT_B_ID,
      customer_id: ACTORS.customerB.id,
      company_id: COMPANY_B_ID,
      status: "customs_in_progress",
      reference_number: "SHP-2026-002",
    },
  ];

  const pricingByShipment = new Map([
    [
      SHIPMENT_A_ID,
      {
        status: options?.pricingStatus ?? ("customer_approved" as const),
        approval_type: options?.pricingApprovalType ?? ("final_fixed" as const),
        final_price: options?.finalPrice !== undefined ? options.finalPrice : 8000,
      },
    ],
  ]);

  const documents = [
    {
      id: DOC_RECEIPT_ID,
      shipment_id: SHIPMENT_A_ID,
      document_type: "customs_receipt",
      status: "approved",
    },
    {
      id: DOC_SHIPMENT_B_ID,
      shipment_id: SHIPMENT_B_ID,
      document_type: "customs_receipt",
      status: "approved",
    },
    ...(includePrereqs
      ? [
          {
            id: "d1111111-1111-4111-8111-111111111101",
            shipment_id: SHIPMENT_A_ID,
            document_type: "commercial_invoice",
            status: "approved",
          },
          {
            id: "d1111111-1111-4111-8111-111111111102",
            shipment_id: SHIPMENT_A_ID,
            document_type: "packing_list",
            status: "approved",
          },
          {
            id: "d1111111-1111-4111-8111-111111111103",
            shipment_id: SHIPMENT_A_ID,
            document_type: "bill_of_lading",
            status: "approved",
          },
          {
            id: "d1111111-1111-4111-8111-111111111104",
            shipment_id: SHIPMENT_A_ID,
            document_type: "certificate_of_origin",
            status: "approved",
          },
        ]
      : []),
  ];

  const obligations: ShipmentCustomsObligationRow[] = [];
  const transactions: ShipmentFinancialTransactionRow[] = [];
  const internalNotes: ShipmentFinancialInternalNoteRow[] = [];
  const regulatoryProcedures: Array<Record<string, unknown>> = [];

  type StageRow = {
    id: string;
    shipment_id: string;
    stage_key: string;
    stage_order: number;
    status: string;
    is_applicable: boolean;
    stage_data: Record<string, unknown>;
    reference_number: string | null;
    completed_at: string | null;
    completed_by: string | null;
  };

  const completedStages: Array<[string, StageRow]> = includePrereqs
    ? (
        [
          ["stage_1_intake", 1, null, {}],
          ["stage_2_pricing", 2, null, {}],
          ["stage_3_nafeza_acid", 3, "ACID-2026-001", {}],
          [
            "stage_4_form_46",
            4,
            "F46-2026-001",
            { form_46_number: "F46-2026-001", form_46_extracted: true },
          ],
          ["stage_5_scouting", 5, null, {}],
          ["stage_6_inspection", 6, null, {}],
          ["stage_7_data_entry", 8, null, {}],
          ["stage_8_valuation", 9, "VAL-2026-001", {}],
        ] as Array<[string, number, string | null, Record<string, unknown>]>
      ).map(([key, order, ref, data]) => [
        `${SHIPMENT_A_ID}:${key}`,
        {
          id: `88888888-8888-4888-8888-${String(order).padStart(12, "0")}`,
          shipment_id: SHIPMENT_A_ID,
          stage_key: key,
          stage_order: order,
          status: "completed",
          is_applicable: true,
          stage_data: data,
          reference_number: ref,
          completed_at: "2026-01-01T00:00:00.000Z",
          completed_by: ACTORS.admin.id,
        },
      ])
    : [];

  const stages = new Map<string, StageRow>([
    ...completedStages,
    [
      `${SHIPMENT_A_ID}:stage_4_type_procedures`,
      {
        id: "88888888-8888-4888-8888-000000000007",
        shipment_id: SHIPMENT_A_ID,
        stage_key: "stage_4_type_procedures",
        stage_order: 7,
        status: "skipped",
        is_applicable: false,
        stage_data: {},
        reference_number: null,
        completed_at: null,
        completed_by: null,
      },
    ],
    [
      `${SHIPMENT_A_ID}:stage_9_fees_payments`,
      {
        id: "88888888-8888-4888-8888-000000000009",
        shipment_id: SHIPMENT_A_ID,
        stage_key: "stage_9_fees_payments",
        stage_order: 10,
        status: "in_progress",
        is_applicable: true,
        stage_data: {},
        reference_number: null,
        completed_at: null,
        completed_by: null,
      },
    ],
  ]);
  const stageHistory: Array<Record<string, unknown>> = [];

  function syncAfterTx(tx: ShipmentFinancialTransactionRow) {
    // 1. If reversal row, mark original transaction is_reversed = true
    if (tx.direction === -1 && tx.reversal_of_transaction_id) {
      const orig = transactions.find((t) => t.id === tx.reversal_of_transaction_id);
      if (orig) {
        orig.is_reversed = true;
        orig.reversed_at = tx.created_at;
        orig.reversed_by = tx.created_by;
      }
    }

    // 2. If linked to obligation, recompute obligation status
    if (tx.customs_obligation_id) {
      const ob = obligations.find((o) => o.id === tx.customs_obligation_id);
      if (ob && ob.status !== "cancelled") {
        ob.status = deriveSingleObligationCoverageStatus(ob, transactions);
      }
    }

    // 3. Reopen stage_9_fees_payments if settlement becomes incomplete
    const summary = calculateShipmentFinancialSummary({
      shipmentId: tx.shipment_id,
      obligations: obligations.filter((o) => o.shipment_id === tx.shipment_id),
      transactions: transactions.filter((t) => t.shipment_id === tx.shipment_id),
      pricing: pricingByShipment.get(tx.shipment_id) ?? null,
    });
    const stageKey = `${tx.shipment_id}:stage_9_fees_payments`;
    const st9 = stages.get(stageKey);
    if (st9 && st9.status === "completed" && !summary.is_financial_settlement_complete) {
      st9.status = "in_progress";
      st9.completed_at = null;
      st9.completed_by = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeQueryBuilder(table: string): any {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let pendingUpdate: Record<string, unknown> | null = null;

    const getTableRows = (): Array<Record<string, unknown>> => {
      switch (table) {
        case "shipments":
          return shipments as unknown as Array<Record<string, unknown>>;
        case "documents":
          return documents as unknown as Array<Record<string, unknown>>;
        case "shipment_customs_obligations":
          return obligations as unknown as Array<Record<string, unknown>>;
        case "shipment_financial_transactions":
          return transactions as unknown as Array<Record<string, unknown>>;
        case "shipment_financial_internal_notes":
          return internalNotes as unknown as Array<Record<string, unknown>>;
        case "shipment_customs_stages":
          return Array.from(stages.values()) as unknown as Array<Record<string, unknown>>;
        case "shipment_regulatory_procedures":
          return regulatoryProcedures;
        case "shipment_financial_migration_audit_v":
          return [];
        default:
          return [];
      }
    };

    const applyFilters = () =>
      getTableRows().filter((r) => filters.every((fn) => fn(r)));

    const executePendingUpdateIfNeeded = () => {
      if (!pendingUpdate) return applyFilters();
      const matched = applyFilters();
      for (const row of matched) {
        Object.assign(row, pendingUpdate);
        if (table === "shipment_financial_transactions") {
          syncAfterTx(row as unknown as ShipmentFinancialTransactionRow);
        }
      }
      pendingUpdate = null;
      return matched;
    };

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      order() {
        return builder;
      },
      async maybeSingle() {
        const rows = executePendingUpdateIfNeeded();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = executePendingUpdateIfNeeded();
        if (!rows[0]) {
          return { data: null, error: { code: "PGRST116", message: "Row not found" } };
        }
        return { data: rows[0], error: null };
      },
      // Allow awaiting the builder directly (Promise-like thenable)
      then(
        onFulfilled?: (val: { data: unknown[]; error: null }) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) {
        const rows = executePendingUpdateIfNeeded();
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
      insert(payload: Record<string, unknown>) {
        if (table === "shipment_financial_transactions") {
          const duplicateIdem = transactions.find(
            (t) =>
              t.shipment_id === payload.shipment_id &&
              t.idempotency_key === payload.idempotency_key,
          );
          if (duplicateIdem) {
            const dbErr = {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "idx_uq_financial_tx_idempotency"',
            };
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: dbErr };
                  },
                };
              },
              then(onFulfilled?: (val: { data: null; error: typeof dbErr }) => unknown) {
                return Promise.resolve({ data: null, error: dbErr }).then(onFulfilled);
              },
            };
          }
        }

        const nowIso = new Date().toISOString();
        const newRow: Record<string, unknown> = {
          id: nextUuid(),
          created_at: nowIso,
          updated_at: nowIso,
          is_reversed: false,
          reversed_at: null,
          reversed_by: null,
          reversal_of_transaction_id: null,
          reversal_reason: null,
          rejection_reason: null,
          ...payload,
        };

        if (table === "shipment_customs_obligations") {
          obligations.push(newRow as unknown as ShipmentCustomsObligationRow);
        } else if (table === "shipment_financial_transactions") {
          const txRow = newRow as unknown as ShipmentFinancialTransactionRow;
          transactions.push(txRow);
          syncAfterTx(txRow);
        } else if (table === "shipment_financial_internal_notes") {
          internalNotes.push(newRow as unknown as ShipmentFinancialInternalNoteRow);
        } else if (table === "shipment_customs_stage_history") {
          stageHistory.push(newRow);
        }

        return {
          select() {
            return {
              async single() {
                return { data: newRow, error: null };
              },
            };
          },
          then(onFulfilled?: (val: { data: unknown; error: null }) => unknown) {
            return Promise.resolve({ data: newRow, error: null }).then(onFulfilled);
          },
        };
      },
      update(payload: Record<string, unknown>) {
        pendingUpdate = payload;
        return builder;
      },
      async upsert(payload: Record<string, unknown>) {
        if (table === "shipment_customs_stages") {
          const key = `${payload.shipment_id}:${payload.stage_key}`;
          const existing = stages.get(key);
          const merged = {
            id: existing?.id ?? nextUuid(),
            shipment_id: String(payload.shipment_id),
            stage_key: String(payload.stage_key),
            stage_order: Number(payload.stage_order ?? existing?.stage_order ?? 10),
            status: String(payload.status),
            is_applicable:
              typeof payload.is_applicable === "boolean"
                ? payload.is_applicable
                : existing?.is_applicable ?? true,
            stage_data: (payload.stage_data as Record<string, unknown>) || {},
            reference_number: (payload.reference_number as string | null) ?? null,
            completed_at: (payload.completed_at as string | null) ?? null,
            completed_by: (payload.completed_by as string | null) ?? null,
          };
          stages.set(key, merged);
          return { data: merged, error: null };
        }
        return { data: payload, error: null };
      },
    };

    return builder;
  }

  const supabase = {
    from(table: string) {
      return makeQueryBuilder(table);
    },
    async rpc(fnName: string, args: { p_shipment_id: string }) {
      const shipmentId = args.p_shipment_id;
      if (fnName === "get_shipment_financial_summary") {
        const summary = calculateShipmentFinancialSummary({
          shipmentId,
          obligations: obligations.filter((o) => o.shipment_id === shipmentId),
          transactions: transactions.filter((t) => t.shipment_id === shipmentId),
          pricing: pricingByShipment.get(shipmentId) ?? null,
        });
        return { data: [summary], error: null };
      }
      if (fnName === "get_customer_shipment_financial_statement") {
        const statement = buildCustomerFinancialStatement(
          transactions.filter((t) => t.shipment_id === shipmentId),
        );
        return { data: statement, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
    },
    // Expose internal state for assertions
    _state: {
      obligations,
      transactions,
      internalNotes,
      stages,
      stageHistory,
      pricingByShipment,
    },
  };

  return supabase;
}

// ─── Comprehensive Phase 2 / Step 3 Test Suite ────────────────────────────────

describe("Phase 2 / Step 3 — Financial Server Actions, Queries, Security & Gate Integration", () => {
  it("1. Role Matrix: Admin can execute writes; Manager is strictly Read-Only; Scout, Inspector, and Data Entry have zero access", async () => {
    const supabase = createStatefulMockSupabase();

    // Admin creates primary customs obligation -> succeeds
    const adminCreateOb = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-100",
        assessed_amount: "30000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(adminCreateOb.success, true);
    assert.equal(adminCreateOb.data?.assessed_amount, 30000);

    // Manager can read obligations and summary -> succeeds
    const managerReadObligations = await getShipmentCustomsObligationsQuery(
      SHIPMENT_A_ID,
      {
        supabase,
        actor: ACTORS.manager,
      },
    );
    assert.equal(managerReadObligations.success, true);
    assert.equal(managerReadObligations.data?.length, 1);

    const managerReadSummary = await getShipmentFinancialSummaryQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.manager,
    });
    assert.equal(managerReadSummary.success, true);
    assert.equal(managerReadSummary.data?.assessed_customs_obligation, 30000);

    // Manager attempts to write (create obligation, record payment, add note, or close Stage 9) -> strictly blocked
    const managerWriteOb = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "supplementary_assessment",
        assessed_amount: "5000.00",
      },
      { supabase, actor: ACTORS.manager },
    );
    assert.equal(managerWriteOb.success, false);
    assert.equal(managerWriteOb.code, "UNAUTHORIZED_ROLE");

    const managerWriteTx = await recordCustomerPaymentToOutAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customer_installment",
        amount: "5000.00",
        payment_method: "bank_transfer",
        reference_number: "BNK-MGR-01",
        idempotency_key: "idem-mgr-01",
      },
      { supabase, actor: ACTORS.manager },
    );
    assert.equal(managerWriteTx.success, false);
    assert.equal(managerWriteTx.code, "UNAUTHORIZED_ROLE");

    const managerCloseStage9 = await completeStage9FinancialSettlementAction(
      { shipment_id: SHIPMENT_A_ID },
      { supabase, actor: ACTORS.manager },
    );
    assert.equal(managerCloseStage9.success, false);
    assert.equal(managerCloseStage9.code, "UNAUTHORIZED_ROLE");

    // Scout, Inspector, and Data Entry are blocked from both reading and writing
    for (const forbiddenRoleActor of [
      ACTORS.scout,
      ACTORS.inspector,
      ACTORS.data_entry,
    ]) {
      const readRes = await getShipmentFinancialSummaryQuery(SHIPMENT_A_ID, {
        supabase,
        actor: forbiddenRoleActor,
      });
      assert.equal(readRes.success, false);
      assert.equal(readRes.code, "UNAUTHORIZED_ROLE");

      const txReadRes = await getShipmentFinancialTransactionsQuery(SHIPMENT_A_ID, {
        supabase,
        actor: forbiddenRoleActor,
      });
      assert.equal(txReadRes.success, false);
      assert.equal(txReadRes.code, "UNAUTHORIZED_ROLE");

      const writeRes = await recordOutDisbursementAction(
        {
          shipment_id: SHIPMENT_A_ID,
          entry_type: "other_expense",
          amount: "500.00",
          is_billable_to_customer: false,
          payment_method: "cash",
          reference_number: "CSH-01",
          idempotency_key: `idem-${forbiddenRoleActor.role}`,
        },
        { supabase, actor: forbiddenRoleActor },
      );
      assert.equal(writeRes.success, false);
      assert.equal(writeRes.code, "UNAUTHORIZED_ROLE");
    }
  });

  it("2. Customer Ownership & Privacy: Customer can only read own verified shipment (requiring both customer_id and company_id), never sees internal notes or non-billable OUT expenses", async () => {
    const supabase = createStatefulMockSupabase();

    // Admin creates obligation, billable disbursement, non-billable internal expense, and internal note
    const obRes = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-200",
        assessed_amount: "20000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(obRes.success, true);

    await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obRes.data!.id,
        amount: "20000.00",
        is_billable_to_customer: true,
        payment_method: "nafeza_epay",
        reference_number: "NFZ-200",
        idempotency_key: "idem-nfz-200",
      },
      { supabase, actor: ACTORS.admin },
    );

    await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "other_expense",
        amount: "1500.00",
        is_billable_to_customer: false,
        payment_method: "cash",
        reference_number: "INT-EXP-200",
        idempotency_key: "idem-int-200",
      },
      { supabase, actor: ACTORS.admin },
    );

    const noteRes = await addFinancialInternalNoteAction(
      {
        shipment_id: SHIPMENT_A_ID,
        note: "ملاحظة داخلية خاصة بالإدارة فقط لا تظهر للعميل",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(noteRes.success, true);

    // Customer B (different company & customer_id) cannot read Shipment A
    const custBRead = await getShipmentFinancialSummaryQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.customerB,
    });
    assert.equal(custBRead.success, false);
    assert.equal(custBRead.code, "UNAUTHORIZED_SHIPMENT");

    // Another user with the SAME company_id (`COMPANY_A_ID`) but different `customer_id` is ALSO blocked!
    const colleagueRead = await getShipmentFinancialSummaryQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.customerSameCompanyColleague,
    });
    assert.equal(colleagueRead.success, false);
    assert.equal(colleagueRead.code, "UNAUTHORIZED_SHIPMENT");

    // Verified owner Customer A can read Shipment A summary, with non_billable_out_disbursements masked to 0
    const custAReadSummary = await getShipmentFinancialSummaryQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.customerA,
    });
    assert.equal(custAReadSummary.success, true);
    assert.equal(custAReadSummary.data?.non_billable_out_disbursements, 0);
    assert.equal(custAReadSummary.data?.billable_out_disbursements, 20000);

    // Customer A cannot access internal notes
    const custANotes = await getShipmentFinancialInternalNotesQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.customerA,
    });
    assert.equal(custANotes.success, false);
    assert.equal(custANotes.code, "UNAUTHORIZED_ROLE");

    // Customer A statement excludes internal non-billable expense and strips staff user IDs
    const custAStatement = await getCustomerShipmentFinancialStatementQuery(
      SHIPMENT_A_ID,
      {
        supabase,
        actor: ACTORS.customerA,
      },
    );
    assert.equal(custAStatement.success, true);
    assert.equal(custAStatement.data?.length, 1);
    assert.equal(custAStatement.data?.[0]?.reference_number, "NFZ-200");
    assert.equal("created_by" in (custAStatement.data?.[0] || {}), false);
    assert.equal("idempotency_key" in (custAStatement.data?.[0] || {}), false);
  });

  it("3. Idempotency, Reference Uniqueness, Customs Allocation Bounds & Anti-Double-Counting of OUT Service Fee", async () => {
    const supabase = createStatefulMockSupabase();

    const obRes = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-300",
        assessed_amount: "40000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    const obligationId = obRes.data!.id;

    // Duplicate primary_assessment on same shipment is rejected
    const dupPrimaryOb = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-301",
        assessed_amount: "10000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(dupPrimaryOb.success, false);
    assert.equal(dupPrimaryOb.code, "DUPLICATE_TRANSACTION");

    // Record valid partial customs disbursement (25,000 EGP of 40,000 EGP)
    const tx1 = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obligationId,
        amount: "25000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-300-1",
        idempotency_key: "idem-300-1",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(tx1.success, true);

    // Duplicate submission with the same idempotency_key AND identical payload returns idempotent success
    const retryIdentical = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obligationId,
        amount: "25000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-300-1",
        idempotency_key: "idem-300-1",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(retryIdentical.success, true);
    assert.equal(retryIdentical.data?.id, tx1.data?.id);
    assert.equal(supabase._state.transactions.length, 1);

    // Duplicate submission with the same idempotency_key and DIFFERENT payload is rejected
    const dupIdem = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obligationId,
        amount: "25000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-300-DIFF",
        idempotency_key: "idem-300-1",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(dupIdem.success, false);
    assert.equal(dupIdem.code, "DUPLICATE_TRANSACTION");

    // Duplicate active reference_number in the same category is rejected
    const dupRef = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obligationId,
        amount: "5000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-300-1",
        idempotency_key: "idem-300-2",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(dupRef.success, false);
    assert.equal(dupRef.code, "DUPLICATE_TRANSACTION");

    // Over-allocating customs obligation beyond 40,000 EGP (25,000 + 20,000 = 45,000 > 40,000) is rejected
    const overAlloc = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obligationId,
        amount: "20000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-300-OVER",
        idempotency_key: "idem-300-over",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(overAlloc.success, false);
    assert.equal(overAlloc.code, "OBLIGATION_OVERALLOCATION");

    // Cannot reduce obligation assessed_amount below already-posted coverage (25,000 EGP)
    const reduceBelowCovered = await updateCustomsObligationAction(
      {
        obligation_id: obligationId,
        shipment_id: SHIPMENT_A_ID,
        assessed_amount: "20000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(reduceBelowCovered.success, false);
    assert.equal(reduceBelowCovered.code, "OBLIGATION_OVERALLOCATION");

    // Cannot cancel obligation while it has posted payments
    const cancelWithPayments = await cancelCustomsObligationAction(
      {
        obligation_id: obligationId,
        shipment_id: SHIPMENT_A_ID,
        cancellation_reason: "محاولة إلغاء مطالبة عليها دفعات",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(cancelWithPayments.success, false);
    assert.equal(cancelWithPayments.code, "VALIDATION_ERROR");

    // Prevent recording base OUT service fee a second time in the ledger
    const doubleServiceFee = await recordCustomerChargeOrCreditAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_category: "customer_charge",
        entry_type: "other_charge",
        amount: "8000.00",
        description: "أتعاب التخليص الأساسية للشحنة",
        idempotency_key: "idem-double-fee",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(doubleServiceFee.success, false);
    assert.equal(doubleServiceFee.code, "VALIDATION_ERROR");
  });

  it("4. Direct Customer Customs Payment Verification, Reversal Atomicity & Stage 9 Gate Enforcement", async () => {
    const supabase = createStatefulMockSupabase({
      pricingStatus: "customer_approved",
      pricingApprovalType: "final_fixed",
      finalPrice: 8000,
    });

    // 1. Create Customs Obligation (50,000 EGP)
    const obRes = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-400",
        assessed_amount: "50000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    const obligationId = obRes.data!.id;

    // 2. Record Direct Customer Customs Payment (50,000 EGP) -> starts in pending_verification
    const directPendingRes = await recordCustomerDirectCustomsPaymentAction(
      {
        shipment_id: SHIPMENT_A_ID,
        customs_obligation_id: obligationId,
        amount: "50000.00",
        payment_method: "nafeza_epay",
        reference_number: "DIRECT-NFZ-400",
        idempotency_key: "idem-direct-400",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(directPendingRes.success, true);
    assert.equal(directPendingRes.data?.entry_status, "pending_verification");
    assert.equal(directPendingRes.data?.customer_visible, false);

    // 3. Attempt to verify direct payment WITHOUT attachment_document_id -> rejected with VERIFICATION_FAILED
    const verifyWithoutDoc = await verifyCustomerDirectCustomsPaymentAction(
      {
        transaction_id: directPendingRes.data!.id,
        shipment_id: SHIPMENT_A_ID,
        attachment_document_id: null,
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(verifyWithoutDoc.success, false);
    assert.equal(verifyWithoutDoc.code, "VERIFICATION_FAILED");

    // 4. Attempt to close Stage 9 while direct customs payment is still pending_verification -> blocked
    const prematureClose1 = await completeStage9FinancialSettlementAction(
      { shipment_id: SHIPMENT_A_ID },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(prematureClose1.success, false);
    assert.equal(prematureClose1.code, "SETTLEMENT_INCOMPLETE");
    assert.equal(
      prematureClose1.data?.gate.blockingReasons.some(
        (r) => r.code === "unverified_customs_payment",
      ),
      true,
    );

    // 5. Verify direct customs payment WITH valid receipt document -> transitions to posted
    const verifyWithDoc = await verifyCustomerDirectCustomsPaymentAction(
      {
        transaction_id: directPendingRes.data!.id,
        shipment_id: SHIPMENT_A_ID,
        attachment_document_id: DOC_RECEIPT_ID,
        verification_note: "تمت مطابقة إيصال سداد نافذة الرسمي",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(verifyWithDoc.success, true);
    assert.equal(verifyWithDoc.data?.entry_status, "posted");
    assert.equal(verifyWithDoc.data?.customer_visible, true);

    // 6. Verify direct customs payment is NOT counted in OUT cash collections (customer still owes 8,000 EGP service fee)
    const gateStatusBeforeFee = await getStage9FinancialGateStatusQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.admin,
    });
    assert.equal(gateStatusBeforeFee.data?.summary.verified_direct_customs_payments, 50000);
    assert.equal(gateStatusBeforeFee.data?.summary.total_received_by_out, 0);
    assert.equal(gateStatusBeforeFee.data?.summary.outstanding_balance_to_out, 8000);
    assert.equal(gateStatusBeforeFee.data?.gate.canComplete, false);

    // 7. Record partial customer payment to OUT (3,000 EGP of 8,000 EGP) -> partial payment does NOT complete Stage 9
    const partialPayment = await recordCustomerPaymentToOutAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customer_installment",
        amount: "3000.00",
        payment_method: "instapay",
        reference_number: "INSTA-400-1",
        idempotency_key: "idem-insta-400-1",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(partialPayment.success, true);

    const closeOnPartial = await completeStage9FinancialSettlementAction(
      { shipment_id: SHIPMENT_A_ID },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(closeOnPartial.success, false);
    assert.equal(closeOnPartial.code, "SETTLEMENT_INCOMPLETE");

    // 8. Record remaining customer payment to OUT (5,000 EGP) -> balance reaches 0.00 -> Stage 9 completes!
    const finalPayment = await recordCustomerPaymentToOutAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "final_settlement",
        amount: "5000.00",
        payment_method: "bank_transfer",
        reference_number: "BNK-400-2",
        idempotency_key: "idem-bnk-400-2",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(finalPayment.success, true);

    const closeSuccess = await completeStage9FinancialSettlementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        reference_number: "SETTLE-2026-400",
        notes: "تمت التسوية المالية الكاملة",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(closeSuccess.success, true);
    assert.equal(
      supabase._state.stages.get(`${SHIPMENT_A_ID}:stage_9_fees_payments`)?.status,
      "completed",
    );
    assert.equal(
      supabase._state.stages.get(`${SHIPMENT_A_ID}:stage_10_clearance_release`)?.status,
      "in_progress",
    );

    // Retrying customer direct payment after verification with identical payload returns idempotent success
    const directRetryAfterVerify = await recordCustomerDirectCustomsPaymentAction(
      {
        shipment_id: SHIPMENT_A_ID,
        customs_obligation_id: obligationId,
        amount: "50000.00",
        payment_method: "nafeza_epay",
        reference_number: "DIRECT-NFZ-400",
        idempotency_key: "idem-direct-400",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(directRetryAfterVerify.success, true);
    assert.equal(directRetryAfterVerify.data?.id, directPendingRes.data!.id);
    assert.equal(directRetryAfterVerify.data?.entry_status, "posted");

    // Reusing the same idempotency_key with a DIFFERENT payload is still rejected
    const directConflictRetry = await recordCustomerDirectCustomsPaymentAction(
      {
        shipment_id: SHIPMENT_A_ID,
        customs_obligation_id: obligationId,
        amount: "50000.00",
        payment_method: "nafeza_epay",
        reference_number: "DIRECT-NFZ-CONFLICT",
        idempotency_key: "idem-direct-400",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(directConflictRetry.success, false);
    assert.equal(directConflictRetry.code, "DUPLICATE_TRANSACTION");

    // 9. Reverse the 5,000 EGP payment -> atomically marks original reversed, reopens balance to 5,000 EGP, and reopens Stage 9 to 'in_progress'!
    const reversalRes = await reverseFinancialTransactionAction(
      {
        transaction_id: finalPayment.data!.id,
        shipment_id: SHIPMENT_A_ID,
        reversal_reason: "ارتداد التحويل البنكي من البنك المراسل",
        idempotency_key: "idem-rev-400-2",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(reversalRes.success, true);
    assert.equal(reversalRes.data?.direction, -1);
    assert.equal(reversalRes.data?.signed_amount, -5000);

    // Stage 9 automatically reopened to 'in_progress'
    assert.equal(
      supabase._state.stages.get(`${SHIPMENT_A_ID}:stage_9_fees_payments`)?.status,
      "in_progress",
    );

    // Attempting to reverse the same transaction a second time -> blocked with ALREADY_REVERSED
    const duplicateReversal = await reverseFinancialTransactionAction(
      {
        transaction_id: finalPayment.data!.id,
        shipment_id: SHIPMENT_A_ID,
        reversal_reason: "محاولة عكس مكررة",
        idempotency_key: "idem-rev-400-dup",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(duplicateReversal.success, false);
    assert.equal(duplicateReversal.code, "ALREADY_REVERSED");

    // Attempting to reverse the reversal entry itself (`direction = -1`) -> blocked with REVERSAL_NOT_ALLOWED
    const reverseOfReversal = await reverseFinancialTransactionAction(
      {
        transaction_id: reversalRes.data!.id,
        shipment_id: SHIPMENT_A_ID,
        reversal_reason: "محاولة عكس قيد عكسي",
        idempotency_key: "idem-rev-of-rev",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(reverseOfReversal.success, false);
    assert.equal(reverseOfReversal.code, "REVERSAL_NOT_ALLOWED");

    // Audit query returns the reversed pair for Admin/Manager
    const auditRes = await getShipmentReversedTransactionsAuditQuery(SHIPMENT_A_ID, {
      supabase,
      actor: ACTORS.manager,
    });
    assert.equal(auditRes.success, true);
    assert.equal(auditRes.data?.reversedPairs.length, 1);
    assert.equal(
      auditRes.data?.reversedPairs[0]?.originalTransaction.id,
      finalPayment.data!.id,
    );
    assert.equal(
      auditRes.data?.reversedPairs[0]?.reversalTransaction?.id,
      reversalRes.data!.id,
    );

    // Rejecting an already-posted transaction is forbidden
    const rejectPosted = await rejectFinancialTransactionAction(
      {
        transaction_id: partialPayment.data!.id,
        shipment_id: SHIPMENT_A_ID,
        rejection_reason: "محاولة رفض قيد مرحّل",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(rejectPosted.success, false);
    assert.equal(rejectPosted.code, "VALIDATION_ERROR");
  });

  it("5. Step 2 Hardening: Stage 9 Prerequisite Gate, Reversal Idempotency, Concurrent Races & Cross-Shipment Attachment Guards", async () => {
    // A. Stage 9 cannot complete if earlier stages (Form 46 / Valuation) & docs are incomplete
    const unreadySupabase = createStatefulMockSupabase({ includePrerequisites: false });
    const obUnready = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-500-UNREADY",
        assessed_amount: "10000.00",
      },
      { supabase: unreadySupabase, actor: ACTORS.admin },
    );
    assert.equal(obUnready.success, true);

    const payCustoms = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obUnready.data!.id,
        amount: "10000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-500-C",
        idempotency_key: "idem-500-c",
      },
      { supabase: unreadySupabase, actor: ACTORS.admin },
    );
    assert.equal(payCustoms.success, true);

    const collectAll = await recordCustomerPaymentToOutAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "final_settlement",
        amount: "18000.00",
        payment_method: "bank_transfer",
        reference_number: "BNK-500-ALL",
        idempotency_key: "idem-500-all",
      },
      { supabase: unreadySupabase, actor: ACTORS.admin },
    );
    assert.equal(collectAll.success, true);

    const blockedWithoutPrereqs = await completeStage9FinancialSettlementAction(
      { shipment_id: SHIPMENT_A_ID },
      { supabase: unreadySupabase, actor: ACTORS.admin },
    );
    assert.equal(blockedWithoutPrereqs.success, false);
    assert.equal(blockedWithoutPrereqs.code, "VALIDATION_ERROR");

    // B. Cross-shipment attachment_document_id & internal note transaction_id guards
    const supabase = createStatefulMockSupabase();
    const obRes = await createCustomsObligationAction(
      {
        shipment_id: SHIPMENT_A_ID,
        claim_type: "primary_assessment",
        customs_claim_number: "CLM-500-SEC",
        assessed_amount: "20000.00",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(obRes.success, true);

    const crossShipmentAttachment = await recordOutDisbursementAction(
      {
        shipment_id: SHIPMENT_A_ID,
        entry_type: "customs_duties",
        customs_obligation_id: obRes.data!.id,
        amount: "20000.00",
        is_billable_to_customer: true,
        payment_method: "bank_transfer",
        reference_number: "BNK-CROSS-DOC",
        attachment_document_id: DOC_SHIPMENT_B_ID,
        idempotency_key: "idem-cross-doc",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(crossShipmentAttachment.success, false);
    assert.equal(crossShipmentAttachment.code, "VALIDATION_ERROR");

    // Seed a transaction on SHIPMENT_B and try linking an internal note from SHIPMENT_A
    const txShipmentB = await recordCustomerChargeOrCreditAction(
      {
        shipment_id: SHIPMENT_B_ID,
        entry_category: "customer_charge",
        entry_type: "documentation_fee",
        amount: "500.00",
        description: "رسوم إضافية شحنة ب",
        idempotency_key: "idem-ship-b-charge",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(txShipmentB.success, true);

    const crossNote = await addFinancialInternalNoteAction(
      {
        shipment_id: SHIPMENT_A_ID,
        transaction_id: txShipmentB.data!.id,
        note: "ملاحظة عبر الشحنات غير مصرح بها",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(crossNote.success, false);
    assert.equal(crossNote.code, "VALIDATION_ERROR");

    // C. Reversal idempotency (identical returns success; conflicting reason fails)
    const retryCharge = await recordCustomerChargeOrCreditAction(
      {
        shipment_id: SHIPMENT_B_ID,
        entry_category: "customer_charge",
        entry_type: "documentation_fee",
        amount: "500.00",
        description: "رسوم إضافية شحنة ب",
        idempotency_key: "idem-ship-b-charge",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(retryCharge.success, true);
    assert.equal(retryCharge.data?.id, txShipmentB.data!.id);

    const rev1 = await reverseFinancialTransactionAction(
      {
        transaction_id: txShipmentB.data!.id,
        shipment_id: SHIPMENT_B_ID,
        reversal_reason: "إلغاء رسم مضاف بالخطأ",
        idempotency_key: "idem-rev-500",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(rev1.success, true);

    const revIdenticalRetry = await reverseFinancialTransactionAction(
      {
        transaction_id: txShipmentB.data!.id,
        shipment_id: SHIPMENT_B_ID,
        reversal_reason: "إلغاء رسم مضاف بالخطأ",
        idempotency_key: "idem-rev-500",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(revIdenticalRetry.success, true);
    assert.equal(revIdenticalRetry.data?.id, rev1.data!.id);

    const revConflictingRetry = await reverseFinancialTransactionAction(
      {
        transaction_id: txShipmentB.data!.id,
        shipment_id: SHIPMENT_B_ID,
        reversal_reason: "سبب عكس مختلف تماماً",
        idempotency_key: "idem-rev-500",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(revConflictingRetry.success, false);
    assert.equal(revConflictingRetry.code, "DUPLICATE_TRANSACTION");

    // D. Concurrent verify / reject transition guard (0-row update without PGRST116 error)
    const pendingDirect = await recordCustomerDirectCustomsPaymentAction(
      {
        shipment_id: SHIPMENT_A_ID,
        customs_obligation_id: obRes.data!.id,
        amount: "15000.00",
        payment_method: "nafeza_epay",
        reference_number: "NAF-RACE-01",
        idempotency_key: "idem-direct-race-01",
      },
      { supabase, actor: ACTORS.admin },
    );
    assert.equal(pendingDirect.success, true);

    const raceVerifySupabase = {
      ...supabase,
      from(table: string) {
        const qb = supabase.from(table);
        if (table !== "shipment_financial_transactions") return qb;
        let sawInitialSelect = false;
        const origSelect = qb.select.bind(qb);
        qb.select = (...args: unknown[]) => {
          const res = origSelect(...args);
          sawInitialSelect = true;
          return res;
        };
        const origUpdate = qb.update.bind(qb);
        qb.update = (payload: Record<string, unknown>) => {
          // Simulate another admin winning the verification race right before UPDATE executes
          if (sawInitialSelect && payload.entry_status === "posted") {
            const target = supabase._state.transactions.find(
              (t) => t.id === pendingDirect.data!.id,
            );
            if (target) {
              target.entry_status = "posted";
              target.customer_visible = true;
            }
          }
          return origUpdate(payload);
        };
        return qb;
      },
    };

    const racedVerify = await verifyCustomerDirectCustomsPaymentAction(
      {
        transaction_id: pendingDirect.data!.id,
        shipment_id: SHIPMENT_A_ID,
        attachment_document_id: DOC_RECEIPT_ID,
      },
      { supabase: raceVerifySupabase, actor: ACTORS.admin },
    );
    assert.equal(racedVerify.success, true);
    assert.equal(racedVerify.data?.entry_status, "posted");

    // E. Concurrent 23505 insert collision recovery on idempotency_key
    let skipFirstIdemLookup = true;
    const raceInsertSupabase = {
      ...supabase,
      from(table: string) {
        const qb = supabase.from(table);
        if (table !== "shipment_financial_transactions") return qb;
        let isIdemLookup = false;
        const origEq = qb.eq.bind(qb);
        qb.eq = (col: string, val: unknown) => {
          if (col === "idempotency_key") isIdemLookup = true;
          return origEq(col, val);
        };
        const origMaybeSingle = qb.maybeSingle.bind(qb);
        qb.maybeSingle = async () => {
          if (isIdemLookup && skipFirstIdemLookup) {
            skipFirstIdemLookup = false;
            return { data: null, error: null };
          }
          return origMaybeSingle();
        };
        return qb;
      },
    };

    const racedChargeRecover = await recordCustomerChargeOrCreditAction(
      {
        shipment_id: SHIPMENT_B_ID,
        entry_category: "customer_charge",
        entry_type: "documentation_fee",
        amount: "500.00",
        description: "رسوم إضافية شحنة ب",
        idempotency_key: "idem-ship-b-charge",
      },
      { supabase: raceInsertSupabase, actor: ACTORS.admin },
    );
    assert.equal(racedChargeRecover.success, true);
    assert.equal(racedChargeRecover.data?.id, txShipmentB.data!.id);
  });
});

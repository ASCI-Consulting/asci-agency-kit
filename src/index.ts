import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const title = text.max(160);
const id = z.uuid();
const website = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !/[\x00-\x20\x7f]/.test(value)
      );
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS URL");
const base = {
  id,
  version: z.number().int().min(1).max(2147483647),
  updatedAt: z.iso.datetime({ offset: true }),
};
const company = z
  .object({
    ...base,
    kind: z.literal("company"),
    data: z.object({ name: title, website: website.nullable() }).strict(),
  })
  .strict();
const person = z
  .object({
    ...base,
    kind: z.literal("person"),
    data: z
      .object({
        name: title,
        companyId: id,
        email: z.email().max(254).nullable(),
        role: title,
      })
      .strict(),
  })
  .strict();
const deal = z
  .object({
    ...base,
    kind: z.literal("deal"),
    data: z
      .object({
        title,
        companyId: id,
        contactRef: z.string().max(160).optional(),
        offer: title,
        stage: z.enum([
          "interest",
          "discovery",
          "scoped",
          "proposal",
          "won",
          "lost",
        ]),
        nextStep: text,
        closeReason: text.optional(),
        discovery: z
          .object({
            goal: text,
            constraints: text,
            stakeholders: text,
            notes: text,
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
const task = z
  .object({
    ...base,
    kind: z.literal("task"),
    data: z
      .object({
        title,
        owner: title,
        dueAt: z.iso.datetime({ offset: true }),
        status: z.enum(["todo", "in_progress", "done", "cancelled"]),
        priority: z.enum(["low", "normal", "high"]),
        linkedId: id.nullable(),
      })
      .strict(),
  })
  .strict();
const proposal = z
  .object({
    ...base,
    kind: z.literal("proposal"),
    data: z
      .object({
        title,
        dealId: id,
        scope: text,
        deliverables: z.array(text).min(1).max(20),
        assumptions: text,
        status: z.enum(["draft", "shared", "accepted", "declined"]),
      })
      .strict(),
  })
  .strict();
const engagement = z
  .object({
    ...base,
    kind: z.literal("engagement"),
    data: z
      .object({
        title,
        dealId: id,
        scope: text,
        status: z.enum(["planned", "active", "delivered", "archived"]),
        milestones: z
          .array(z.object({ title, done: z.boolean() }).strict())
          .min(1)
          .max(20),
        handover: text.optional(),
      })
      .strict(),
  })
  .strict();

export const agencyRecordSchema = z
  .discriminatedUnion("kind", [
    company,
    person,
    deal,
    task,
    proposal,
    engagement,
  ])
  .refine(
    (record) =>
      new TextEncoder().encode(JSON.stringify(record.data)).byteLength <= 30000,
    "Record data exceeds 30 KiB",
  );
export type AgencyRecord = z.infer<typeof agencyRecordSchema>;
export type AgencyKind = AgencyRecord["kind"];
export const agencyKinds = [
  "company",
  "person",
  "deal",
  "task",
  "proposal",
  "engagement",
] as const;
export const agencyChangeSchema = z
  .object({
    record: agencyRecordSchema,
    expectedVersion: z.number().int().min(0),
    idempotencyKey: id,
  })
  .strict();

export function linkedRecordId(record: AgencyRecord): string | null {
  switch (record.kind) {
    case "company":
      return null;
    case "person":
    case "deal":
      return record.data.companyId;
    case "proposal":
    case "engagement":
      return record.data.dealId;
    case "task":
      return record.data.linkedId;
  }
}
export function recordTitle(record: AgencyRecord): string {
  return record.kind === "company" || record.kind === "person"
    ? record.data.name
    : record.data.title;
}
export function validateAgencyParent(
  record: AgencyRecord,
  records: readonly AgencyRecord[],
) {
  const parentId = linkedRecordId(record);
  if (!parentId) return;
  if (parentId === record.id)
    throw new Error("A record cannot be its own parent");
  const parent = records.find((item) => item.id === parentId);
  if (!parent) throw new Error("The linked parent record is unavailable");
  if (["person", "deal"].includes(record.kind) && parent.kind !== "company")
    throw new Error("A company parent is required");
  if (
    ["proposal", "engagement"].includes(record.kind) &&
    parent.kind !== "deal"
  )
    throw new Error("A deal parent is required");
  if (
    record.kind === "engagement" &&
    (parent.kind !== "deal" || parent.data.stage !== "won")
  )
    throw new Error("Delivery requires an explicitly won deal");
}
export function applyAgencyChange(
  records: readonly AgencyRecord[],
  input: AgencyRecord,
  expectedVersion: number,
): AgencyRecord[] {
  const record = agencyRecordSchema.parse(input);
  const previous = records.find((item) => item.id === record.id);
  if (
    (previous?.version ?? 0) !== expectedVersion ||
    record.version !== expectedVersion + 1
  )
    throw new Error("Record version conflict; reload before applying");
  if (previous && previous.kind !== record.kind)
    throw new Error("Record kind is immutable");
  validateAgencyParent(record, records);
  return previous
    ? records.map((item) => (item.id === record.id ? record : item))
    : [...records, record];
}
export function agencySummary(records: readonly AgencyRecord[], asOf: string) {
  if (!z.iso.datetime({ offset: true }).safeParse(asOf).success)
    throw new Error("Use an aware observation timestamp");
  const openTasks = records.filter(
    (item) =>
      item.kind === "task" && !["done", "cancelled"].includes(item.data.status),
  );
  return {
    openTasks: openTasks.length,
    overdueTasks: openTasks.filter(
      (item) =>
        item.kind === "task" && Date.parse(item.data.dueAt) < Date.parse(asOf),
    ).length,
    openDeals: records.filter(
      (item) =>
        item.kind === "deal" && !["won", "lost"].includes(item.data.stage),
    ).length,
    wonDeals: records.filter(
      (item) => item.kind === "deal" && item.data.stage === "won",
    ).length,
    activeEngagements: records.filter(
      (item) =>
        item.kind === "engagement" &&
        ["planned", "active"].includes(item.data.status),
    ).length,
  };
}

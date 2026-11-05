/**
 * In-app notifications for handheld jobs (user decision 2026-10-28: "send proper notifications").
 * Always sent after the transaction commits (cancels by the sweep, since the hooks run inside other
 * modules' transactions), and each links to the document's own page.
 */
import { HandheldDocumentType, Prisma, StockTakeType } from "@prisma/client";
import prisma from "../../prisma/client";
import { ROLES } from "../../shared/constants/roles";
import { holdsPermission } from "../../shared/effectivePermissions";
import { NotificationPayload, NotificationService } from "../notification/notification.service";
import { permissionsOf } from "./handheld.logic";

export const HANDHELD_NOTIFICATION_TYPES = {
  WAITING_NO_STATION: "HANDHELD_WAITING_NO_STATION",
  WAITING_LONG: "HANDHELD_WAITING_LONG",
  DELIVERED: "HANDHELD_DELIVERED",
  RECEIVED: "HANDHELD_RECEIVED",
  POSTED: "HANDHELD_POSTED",
  CANCELLED: "HANDHELD_CANCELLED",
  STATION_OFFLINE: "HANDHELD_STATION_OFFLINE",
  INSTALL_FAILED: "HANDHELD_INSTALL_FAILED",
} as const;

/** What a notice needs to name and link a job. */
export const jobRefSelect = {
  id: true,
  type: true,
  documentNumber: true,
  branchId: true,
  sentById: true,
  pickerName: true,
  cancelRemark: true,
  cancelledById: true,
  branch: { select: { name: true } },
  pickingList: { select: { indent: { select: { id: true, indentNumber: true } } } },
  customerOrder: { select: { id: true, cpoNumber: true } },
  mit: { select: { id: true, mitNumber: true } },
  stockTakeSheet: { select: { id: true, sheetNumber: true, stockTake: { select: { id: true, type: true } } } },
} satisfies Prisma.HandheldDocumentSelect;

export type JobRef = Prisma.HandheldDocumentGetPayload<{ select: typeof jobRefSelect }>;

/** "Indent 2026000006", "CPO 2026000016", "MIT 2026000003", "Count sheet 2026000003" and the page. */
export function describeJob(job: JobRef): { label: string; link: string } {
  switch (job.type) {
    case HandheldDocumentType.INDENT_PICK:
      return { label: `Indent ${job.pickingList?.indent.indentNumber ?? job.documentNumber}`, link: `/transfers/indents/${job.pickingList?.indent.id}` };
    case HandheldDocumentType.CPO_PICK:
      return { label: `CPO ${job.customerOrder?.cpoNumber ?? job.documentNumber}`, link: `/part-sale/orders/${job.customerOrder?.id}` };
    case HandheldDocumentType.MIT_RECEIVE:
      return { label: `MIT ${job.mit?.mitNumber ?? job.documentNumber}`, link: `/inventory/mobis-receipts/${job.mit?.id}` };
    default: {
      const sheet = job.stockTakeSheet;
      const audit = sheet?.stockTake.type === StockTakeType.AUDIT;
      return {
        label: `${audit ? "Audit sheet" : "Count sheet"} ${sheet?.sheetNumber ?? job.documentNumber}`,
        link: `/inventory/${audit ? "stock-audit" : "stock-taking"}/${sheet?.stockTake.id}/sheets/${sheet?.id}`,
      };
    }
  }
}

export class HandheldNotifier {
  private notifications = new NotificationService();

  async jobs(ids: string[]) {
    if (!ids.length) return [];
    return prisma.handheldDocument.findMany({ where: { id: { in: ids } }, select: jobRefSelect });
  }

  async send(payload: NotificationPayload, audience: { userIds?: (string | null | undefined)[]; roles?: { role: string; branchId?: string }[]; postersOf?: JobRef }) {
    const roles = audience.roles ?? [];
    const roleUsers = roles.length
      ? await prisma.user.findMany({
          where: { isActive: true, OR: roles.map((r) => ({ role: { name: r.role }, ...(r.branchId ? { branchId: r.branchId } : {}) })) },
          select: { id: true },
        })
      : [];
    const posters = audience.postersOf ? await this.postersOf(audience.postersOf) : [];
    await this.notifications.notifyUsers(
      [...(audience.userIds ?? []).filter((id): id is string => !!id), ...roleUsers.map((u) => u.id), ...posters],
      { ...payload, branchId: payload.branchId ?? null },
    );
  }

  /** Active users of the job's branch whose role may post it (the screen's own permission). */
  private async postersOf(job: JobRef): Promise<string[]> {
    const permission = permissionsOf(job.type, job.stockTakeSheet?.stockTake.type === StockTakeType.AUDIT).write;
    const users = await prisma.user.findMany({
      where: { isActive: true, branchId: job.branchId, AND: [holdsPermission(permission)] },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private storeManagers(branchId: string) {
    return [{ role: ROLES.BRANCH_STORE_MANAGER, branchId }];
  }

  async waitingNoStation(job: JobRef) {
    const { label, link } = describeJob(job);
    await this.send(
      { type: HANDHELD_NOTIFICATION_TYPES.WAITING_NO_STATION, title: "Handheld job waiting", message: `${label} is waiting: no handheld station is online at ${job.branch.name}.`, link, branchId: job.branchId },
      { userIds: [job.sentById], roles: this.storeManagers(job.branchId) },
    );
  }

  async waitingLong(job: JobRef, hours: number) {
    const { label, link } = describeJob(job);
    await this.send(
      { type: HANDHELD_NOTIFICATION_TYPES.WAITING_LONG, title: "Handheld job still waiting", message: `${label} has waited ${hours} h for a handheld.`, link, branchId: job.branchId },
      { userIds: [job.sentById], roles: this.storeManagers(job.branchId) },
    );
  }

  async delivered(job: JobRef, deviceName: string) {
    const { label, link } = describeJob(job);
    const who = job.pickerName ? ` (${job.type === HandheldDocumentType.COUNT_SHEET ? "checker" : "picker"} ${job.pickerName})` : "";
    await this.send(
      { type: HANDHELD_NOTIFICATION_TYPES.DELIVERED, title: "On the handheld", message: `${label} is on handheld ${deviceName}${who}.`, link, branchId: job.branchId },
      { userIds: [job.sentById] },
    );
  }

  async received(job: JobRef, outcome: string) {
    const { label, link } = describeJob(job);
    await this.send(
      { type: HANDHELD_NOTIFICATION_TYPES.RECEIVED, title: "Finished on the handheld", message: `${label} ${outcome}. Review and post.`, link, branchId: job.branchId },
      { userIds: [job.sentById], postersOf: job },
    );
  }

  async posted(job: JobRef, actorId: string) {
    if (!job.sentById || job.sentById === actorId) return;
    const { label, link } = describeJob(job);
    await this.send(
      { type: HANDHELD_NOTIFICATION_TYPES.POSTED, title: "Handheld result posted", message: `${label} was posted.`, link, branchId: job.branchId },
      { userIds: [job.sentById] },
    );
  }

  /** Jobs cancelled by someone other than the sender, or by the web getting there first (from the sweep). */
  async cancelled(jobs: JobRef[]) {
    for (const job of jobs) {
      if (!job.sentById || job.sentById === job.cancelledById) continue;
      const { label, link } = describeJob(job);
      await this.send(
        { type: HANDHELD_NOTIFICATION_TYPES.CANCELLED, title: "Handheld job cancelled", message: `${label} was taken off the handheld: ${job.cancelRemark ?? "cancelled"}.`, link, branchId: job.branchId },
        { userIds: [job.sentById] },
      );
    }
  }

  async stationOffline(station: { name: string; branchId: string; branch: { name: string } }, waiting: number) {
    await this.send(
      {
        type: HANDHELD_NOTIFICATION_TYPES.STATION_OFFLINE,
        title: "Handheld station offline",
        message: `Handheld station ${station.name} at ${station.branch.name} is offline; ${waiting} handheld job(s) are waiting.`,
        link: "/settings/hhdc",
        branchId: station.branchId,
      },
      { roles: [...this.storeManagers(station.branchId), { role: ROLES.ADMIN }] },
    );
  }

  async installFailed(device: { name: string; branchId: string }, stationName: string, error: string) {
    await this.send(
      {
        type: HANDHELD_NOTIFICATION_TYPES.INSTALL_FAILED,
        title: "Handheld app not updated",
        message: `The Danamotors app could not be installed on handheld ${device.name} at ${stationName}: ${error}`,
        link: "/settings/hhdc",
        branchId: device.branchId,
      },
      { roles: [...this.storeManagers(device.branchId), { role: ROLES.ADMIN }] },
    );
  }
}

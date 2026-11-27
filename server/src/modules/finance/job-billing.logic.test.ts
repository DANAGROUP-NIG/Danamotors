import { assertJobBillingReady } from "./job-billing.logic";

const ready = { status: "READY", qcState: "PASSED" as const, creditApprovedById: null };
it.each(["OPEN", "IN_PROGRESS", "WAITING_PARTS", "QC", "BILLED", "CANCELLED"])(
  "rejects unfinished or closed status %s even with a passed QC",
  (status) => {
    expect(() => assertJobBillingReady({ ...ready, status })).toThrow(
      "Only ready",
    );
  },
);
it.each(["READY", "Ready", "Completed"])(
  "accepts existing ready alias %s only with a passed QC",
  (status) => {
    expect(() =>
      assertJobBillingReady({ ...ready, status, qcState: "PASSED" }),
    ).not.toThrow();
    expect(() =>
      assertJobBillingReady({ ...ready, status, qcState: "PENDING" }),
    ).toThrow("passed quality check");
  },
);
it.each(["DELIVERED", "Closed"])(
  "requires approved credit and passed QC for %s",
  (status) => {
    expect(() => assertJobBillingReady({ ...ready, status })).toThrow(
      "approved credit",
    );
    expect(() =>
      assertJobBillingReady({
        ...ready,
        status,
        creditApprovedById: "approval",
      }),
    ).not.toThrow();
    expect(() =>
      assertJobBillingReady({
        ...ready,
        status,
        creditApprovedById: "approval",
        qcState: "FAILED",
      }),
    ).toThrow("passed quality check");
  },
);

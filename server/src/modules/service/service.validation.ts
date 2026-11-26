import { STAGE_ACTIONS } from "./job-stage.logic";
import { z } from "zod";
import { MAX_MILEAGE } from "../warranty/warranty.logic";
import { openingConsentProof } from "./job-opening-consent";

const mileageField = z.number().int("Mileage must be a whole number").min(0, "Mileage cannot be negative").max(MAX_MILEAGE);
const acknowledgementFields = {
  warrantyAcknowledged: z.boolean().optional(),
  acknowledgedCampaignIds: z.array(z.string().uuid("Invalid campaign ID")).max(50).optional(),
};

export const serviceIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid appointment ID"),
  }),
});

// The body is validated by jobOpeningBody in convertAppointment once booking fields are merged in.
export const convertAppointmentSchema = serviceIdParamSchema.extend({
  body: z.record(z.string(), z.unknown()),
});

export const jobCardIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid job card ID"),
  }),
});

export const estimateIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid estimate ID"),
  }),
});

export const bookingRequestBody = z.object({
  complaintCodeId: z.string().uuid().optional(),
  defectCode: z.string().trim().max(50).optional(),
  spare: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
  oil: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
  labour: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
  description: z.string().trim().max(2000).optional(),
}).strict().refine(
  row => !!row.complaintCodeId || !!row.defectCode || !!row.description,
  "Enter a complaint code or description",
);

// Simple text and the optional detailed grid share the same stored request rows.
const bookingRequestText = z.string().trim().min(1, "Add a customer request").max(2000)
  .transform(description => [{ description }]);
const bookingRequests = z.union([bookingRequestText, z.array(bookingRequestBody).min(1).max(100)]);

const bookingFields = {
  serviceTypeId: z.string().uuid().optional(),
  mileage: mileageField.optional(),
  acFitted: z.boolean().optional(),
  followUpJobId: z.string().uuid().nullable().optional(),
  requests: bookingRequests.optional(),
};

export const createAppointmentSchema = z.object({
  body: z.object({
    ...bookingFields,
    requests: bookingRequests,
    customerId: z.string().uuid("Invalid customer ID"),
    vehicleId: z.string().uuid("Invalid vehicle ID"),
    branchName: z.string().min(1, "Branch name is required"),
    serviceTypeId: z.string().uuid("Invalid service type ID").optional(),
    serviceId: z.string().uuid("Invalid service ID").optional(),
    scheduledAt: z.string().datetime("Invalid scheduled date"),
    durationMins: z.number().int().positive().max(2147483647).optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    createdById: z.string().uuid("Invalid user ID").optional(),
  }),
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    ...bookingFields,
    bookingStatus: z.enum(["BOOKED", "CANCELLED", "NO_SHOW"]).optional(),
    cancelReason: z.string().trim().min(1).max(2000).optional(),
    scheduledAt: z.string().datetime("Invalid scheduled date").optional(),
    serviceId: z.string().uuid("Invalid service ID").optional(),
    durationMins: z.number().int().positive().max(2147483647).optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    // Odometer reading taken at check-in (status 'Checked In').
    mileage: mileageField.optional(),
    ...acknowledgementFields,
  }),

  params: z.object({
    id: z.string().uuid("Invalid appointment ID"),
  }),
});

export const jobCardStatus = z.enum([
  "Open",
  "Pending",
  "In Progress",
  "On Hold",
  "Quality Check",
  "Ready",
  "Completed",
  "Closed",
  "Cancelled",
]);

const jobCardDate = z
  .string()
  .refine(
    (value) =>
      /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "Invalid date",
  );

export const listJobCardsSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(1000).optional(),
      branchId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      search: z.string().optional(),
      status: z.string().optional(),
      unassignedTechnician: z.enum(["true", "false"]).optional(),
      // SERVICE (default) lists service jobs only; PDI jobs have their own menu.
      // HISTORY: a vehicle's history; includes PDI only when the PDI setting says so.
      jobType: z.enum(["SERVICE", "PDI", "ALL", "HISTORY"]).optional(),
      dateFrom: jobCardDate.optional(),
      dateTo: jobCardDate.optional(),
    })
    .refine(
      (q) =>
        !q.dateFrom ||
        !q.dateTo ||
        Date.parse(q.dateFrom) <= Date.parse(q.dateTo),
      "Date range is reversed",
    ),
});

export const jobOpeningBody = z
  .object({
    openingConsent: openingConsentProof.optional(),
    appointmentId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    serviceTypeId: z.string().uuid(),
    customerId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    branchName: z.string().trim().min(1),
    description: z.string().trim().min(1).max(5000),
    mileage: mileageField,
    // An odometer reading below the last recorded one is allowed only for an audited replacement.
    odometerReplaced: z.boolean().optional(),
    odometerReplacedReason: z.string().trim().max(300).optional(),
    ...acknowledgementFields,
    // The workshop supervisor sets the bay and technician in Diagnosis; both stay optional at opening.
    bayId: z.string().uuid().optional(),
    serviceAdvisorId: z.string().uuid(),
    engineerId: z.string().uuid().optional(),
    technicianId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    promisedAt: z.string().datetime(),

    complaints: z.array(bookingRequestBody).min(1).max(100),

    acFitted: z.boolean().optional(),
    inHouse: z.boolean().optional(),
    remarks: z.string().trim().max(5000).optional(),
    isRepeat: z.boolean().optional(),
    previousJobId: z.string().uuid().optional(),
    repeatReason: z.string().trim().max(2000).optional(),
    tyres: z
      .array(
        z
          .object({
            makeId: z.string().uuid().optional(),
            number: z.string().trim().toUpperCase().max(100).optional(),
          })
          .strict(),
      )
      .length(5)
      .optional(),
    batteryMakeId: z.string().uuid().optional(),
    batteryNumber: z.string().trim().toUpperCase().max(100).optional(),
    customField1: z.string().trim().max(500).optional(),
    acType: z.enum(["FACTORY", "DEALER", "NONE"]).optional(),
    estimatedParts: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedOil: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedLabour: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    serviceCharge: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    estimatedCost: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.appointmentId && !data.openingConsent) ctx.addIssue({ code: 'custom', path: ['openingConsent'], message: 'Accept the job opening terms before converting this appointment' });
    // The reason is recorded at review; at opening the advisor may add a note (repeatReason).
    if (data.isRepeat && !data.previousJobId)
      ctx.addIssue({
        code: "custom",
        path: ["previousJobId"],
        message: "Choose the previous job this visit repeats",
      });

    if (!data.isRepeat && data.previousJobId)
      ctx.addIssue({
        code: "custom",
        path: ["isRepeat"],
        message: "Mark the job as a repeat",
      });

    if (data.odometerReplaced && !data.odometerReplacedReason?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["odometerReplacedReason"],
        message: "Give a reason for the odometer replacement",
      });
  });

export const createJobCardSchema = z.object({
  body: jobOpeningBody,
});

export const jobUpdateBody = z
  .object({
    serviceCharge: z.number().finite().min(0).max(1e12).multipleOf(0.01).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    workDone: z.string().trim().max(10000).optional(),
    status: z
      .enum(["IN_PROGRESS", "WAITING_PARTS", "QC", "READY", "DELIVERED", "CANCELLED"])
      .optional(),
    remarks: z.string().trim().max(2000).optional(),
    deliveryAdvisorId: z.string().uuid().optional(),
    /** The floor engineer (#97); null clears it. */
    engineerId: z.string().uuid().nullable().optional(),
    lateReasonIds: z
      .array(z.string().uuid())
      .max(6)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Reasons must be distinct",
      )
      .optional(),
    /** Delay remark recorded with the late-delivery reasons (internal). */
    lateRemarks: z.string().trim().max(1000).optional(),
  })
  .strict();

export const updateJobCardSchema = z.object({
  body: jobUpdateBody,

  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createInspectionSchema = z.object({
  body: z.object({
    inspectorId: z.string().uuid("Invalid inspector ID").optional(),
    findings: z.string().min(1, "Findings are required"),
    passed: z.boolean().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),

  params: z.object({
    id: z.string().uuid("Invalid job card ID"),
  }),
});

export const estimateBody = z
  .object({
    description: z.string().trim().min(1).max(2000),
    upfrontPaymentPercent: z.number().finite().min(0).max(100).multipleOf(0.01).optional(),

    lines: z
      .array(
        z
          .object({
            type: z.enum(["COMPLAINT", "PART", "LABOUR", "SERVICE"]),
            referenceId: z.string().uuid().optional(),
            description: z.string().trim().max(2000).optional(),
            quantity: z.number().finite().positive().max(1e6).default(1),
            includedInService: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const createEstimateSchema = z.object({
  body: estimateBody,

  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createApprovalSchema = z.object({
  body: z.object({
    customerId: z.string().uuid("Invalid customer ID"),
    approved: z.boolean(),
    consentAccepted: z.boolean().optional(),
    expectedVersion: z.number().int().positive(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    signerName: z.string().trim().min(1).max(200).optional(),
    relationship: z.string().trim().min(1).max(200).optional(),
    signatureImage: z.string().max(88000).optional(),
    overrideReason: z.string().trim().min(1).max(2000).optional(),
    decisionDate: z.string().datetime().optional(),
    comments: z.string().optional(),
    status: z.string().optional(),
  }),

  params: z.object({
    id: z.string().uuid("Invalid estimate ID"),
  }),
});

export const labourLineIdParamSchema = z.object({
  params: z.object({
    lineId: z.string().uuid("Invalid labour line ID"),
  }),
});

export const createLabourItemSchema = z.object({
  body: z
    .object({
      code: z.string().trim().min(1).max(50),
      description: z.string().trim().min(1).max(300),
      vehicleSystem: z.string().trim().max(100).optional(),
      group: z.string().trim().max(100).optional(),
      serviceGroupId: z.string().uuid().nullable().optional(),
      defaultHours: z.number().positive(),
      rate: z.number().nonnegative(),
      majorLabour: z.boolean().optional(),
      insured: z.boolean().optional(),
      approvalRequired: z.boolean().optional(),
      externalLabour: z.boolean().optional(),
      underAmc: z.boolean().optional(),
      followUpAnalysis: z.boolean().optional(),
      amountEditable: z.boolean().optional(),
      includeInTopN: z.boolean().optional(),
    })
    .strict(),
});

export const updateLabourItemSchema = z.object({
  body: z
    .object({
      code: z.string().trim().min(1).max(50).optional(),
      description: z.string().trim().min(1).max(300).optional(),
      vehicleSystem: z.string().trim().max(100).optional(),
      group: z.string().trim().max(100).optional(),
      serviceGroupId: z.string().uuid().nullable().optional(),
      defaultHours: z.number().positive().optional(),
      rate: z.number().nonnegative().optional(),
      active: z.boolean().optional(),
      majorLabour: z.boolean().optional(),
      insured: z.boolean().optional(),
      approvalRequired: z.boolean().optional(),
      externalLabour: z.boolean().optional(),
      underAmc: z.boolean().optional(),
      followUpAnalysis: z.boolean().optional(),
      amountEditable: z.boolean().optional(),
      includeInTopN: z.boolean().optional(),
    })
    .strict()
    .refine(
      (body) => Object.keys(body).length > 0,
      "At least one field is required",
    ),

  params: z.object({
    id: z.string().uuid("Invalid labour item ID"),
  }),
});

export const createJobCardLabourSchema = z.object({
  body: z
    .object({
      labourItemId: z.string().uuid("Invalid labour item ID"),
      hours: z.number().positive().optional(),
      rate: z.number().nonnegative().optional(),
      technicianId: z.string().uuid("Invalid technician ID").optional(),
      mechanicId: z.string().uuid("Invalid mechanic ID").optional(),
    })
    .strict(),

  params: z.object({
    id: z.string().uuid("Invalid job card ID"),
  }),
});

export const updateJobCardLabourSchema = z.object({
  body: z
    .object({
      labourItemId: z.string().uuid("Invalid labour item ID").optional(),
      hours: z.number().positive().optional(),
      rate: z.number().nonnegative().optional(),
      technicianId: z
        .string()
        .uuid("Invalid technician ID")
        .nullable()
        .optional(),
      mechanicId: z.string().uuid("Invalid mechanic ID").nullable().optional(),
    })
    .strict()
    .refine(
      (body) => Object.keys(body).length > 0,
      "At least one field is required",
    ),

  params: z.object({
    lineId: z.string().uuid("Invalid labour line ID"),
  }),
});

/** POST /service/job-cards/:id/stage: one staged job card action. */
export const stageActionSchema = z.object({
  params: z.object({ id: z.string().uuid("Invalid job card ID") }),
  body: z
    .object({
      action: z.enum(STAGE_ACTIONS, {
        errorMap: () => ({ message: "Choose one of the actions shown for this step" }),
      }),
      note: z.string().trim().max(2000, "Keep the note to 2,000 characters or fewer").optional(),
      requestId: z
        .string({ required_error: "Send the request ID the app generates for each step action" })
        .uuid("The request ID must be a UUID generated by the app"),
    })
    .strict()
    .superRefine((body, context) => {
      if (body.action === "CANCEL" && !body.note)
        context.addIssue({ code: "custom", path: ["note"], message: "Give the reason for cancelling the job." });
    }),
});

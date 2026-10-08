import { z } from "zod";
import { MAX_MILEAGE } from "../warranty/warranty.logic";

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

const moneyField = z.number().min(0).max(1e12).multipleOf(0.01);
const bookingRequests = z
  .array(
    z
      .object({
        complaintCodeId: z.string().uuid().optional(),
        description: z.string().trim().min(1, "Describe the request").max(500),
        estimatedParts: moneyField.optional(),
        estimatedLabour: moneyField.optional(),
        estimatedOil: moneyField.optional(),
      })
      .strict(),
  )
  .max(30);

export const createAppointmentSchema = z.object({
  body: z.object({
    // Workshop service type (SERVICE_TYPE master), odometer reading and requests at booking.
    serviceTypeId: z.string().uuid("Invalid service type").optional(),
    mileage: mileageField.optional(),
    requests: bookingRequests.optional(),
    customerId: z.string().uuid("Invalid customer ID"),
    vehicleId: z.string().uuid("Invalid vehicle ID"),
    branchName: z.string().min(1, "Branch name is required"),
    serviceId: z.string().uuid("Invalid service ID"),
    scheduledAt: z.string().datetime("Invalid scheduled date"),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    createdById: z.string().uuid("Invalid user ID").optional(),
  }),
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    scheduledAt: z.string().datetime("Invalid scheduled date").optional(),
    serviceId: z.string().uuid("Invalid service ID").optional(),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    // Odometer reading taken at check-in (status 'Checked In').
    mileage: mileageField.optional(),
    serviceTypeId: z.string().uuid("Invalid service type").nullable().optional(),
    // Replaces the booking requests when sent.
    requests: bookingRequests.optional(),
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
    appointmentId: z.string().uuid().optional(),
    // A pre-job estimate the job is opened from.
    estimateId: z.string().uuid().optional(),
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
    bayId: z.string().uuid(),
    serviceAdvisorId: z.string().uuid(),
    technicianId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    freeServiceCouponNo: z.string().trim().max(50).optional(),
    promisedAt: z.string().datetime(),

    complaints: z
      .array(
        z
          .object({
            complaintCodeId: z.string().uuid().optional(),
            defectCode: z.string().trim().max(50).optional(),
            spare: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
            oil: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
            labour: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
            description: z.string().trim().max(2000).optional(),
          })
          .strict()
          .refine(
            (c) => !!c.complaintCodeId || !!c.defectCode || !!c.description,
            "Enter a complaint code or description",
          ),
      )
      .min(1)
      .max(100),

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
    checklist: z.string().trim().max(5000).optional(),
    estimatedParts: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedOil: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedLabour: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    serviceCharge: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    estimatedCost: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.technicianId && !data.teamId)
      ctx.addIssue({
        code: "custom",
        path: ["technicianId"],
        message: "Select a main mechanic or team",
      });

    if (data.isRepeat && (!data.previousJobId || !data.repeatReason))
      ctx.addIssue({
        code: "custom",
        path: ["repeatReason"],
        message: "A repeat requires a previous job and reason",
      });

    if (!data.isRepeat && (data.previousJobId || data.repeatReason))
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
    observations: z.string().trim().max(10000).optional(),
    workDone: z.string().trim().max(10000).optional(),
    status: z
      .enum(["IN_PROGRESS", "QC", "READY", "DELIVERED", "CANCELLED"])
      .optional(),
    remarks: z.string().trim().max(2000).optional(),
    serviceTypeId: z.string().uuid().nullable().optional(),
    freeServiceCouponNo: z.string().trim().max(50).nullable().optional(),
    deliveryAdvisorId: z.string().uuid().optional(),
    lateReasonIds: z
      .array(z.string().uuid())
      .max(6)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Reasons must be distinct",
      )
      .optional(),
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
      defaultHours: z.number().positive(),
      rate: z.number().nonnegative(),
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
      defaultHours: z.number().positive().optional(),
      rate: z.number().nonnegative().optional(),
      active: z.boolean().optional(),
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

/**
 * Technicians on a labour line (at most three, as on the legacy labour slip). Shares are
 * optional; when given for one they must be given for all and add up to 100.
 */
export const labourTechniciansField = z
  .array(
    z
      .object({
        technicianId: z.string().uuid("Invalid technician ID"),
        sharePercent: z.number().gt(0, "A share must be more than 0").max(100).optional(),
      })
      .strict(),
  )
  .max(3, "At most three technicians per labour line")
  .refine((list) => new Set(list.map((item) => item.technicianId)).size === list.length, "Each technician can appear once")
  .refine((list) => {
    const shares = list.filter((item) => item.sharePercent !== undefined);
    if (!shares.length) return true;
    return shares.length === list.length && Math.abs(shares.reduce((sum, item) => sum + item.sharePercent!, 0) - 100) < 0.001;
  }, "Give a share for every technician, adding up to 100%, or none for an even split");

export const createJobCardLabourSchema = z.object({
  body: z
    .object({
      labourItemId: z.string().uuid("Invalid labour item ID"),
      hours: z.number().positive().optional(),
      rate: z.number().nonnegative().optional(),
      technicianId: z.string().uuid("Invalid technician ID").optional(),
      technicians: labourTechniciansField.optional(),
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
      technicians: labourTechniciansField.optional(),
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

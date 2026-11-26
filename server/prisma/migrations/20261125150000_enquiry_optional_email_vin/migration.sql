-- Public service request form: email is optional (phone is the required contact),
-- and the VIN the customer types is kept on the enquiry instead of being dropped.
ALTER TABLE "Enquiry" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Enquiry" ADD COLUMN "vin" TEXT;

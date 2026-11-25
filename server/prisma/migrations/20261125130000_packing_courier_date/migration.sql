-- Legacy packing list Courier Date: the day the courier or driver took the consignment.
ALTER TABLE "PackingList" ADD COLUMN "courierDate" TIMESTAMP(3);

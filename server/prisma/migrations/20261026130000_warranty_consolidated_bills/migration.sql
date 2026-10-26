CREATE TABLE "_WarrantyJobBills" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);
CREATE UNIQUE INDEX "_WarrantyJobBills_AB_unique" ON "_WarrantyJobBills"("A", "B");
CREATE INDEX "_WarrantyJobBills_B_index" ON "_WarrantyJobBills"("B");
ALTER TABLE "_WarrantyJobBills" ADD CONSTRAINT "_WarrantyJobBills_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_WarrantyJobBills" ADD CONSTRAINT "_WarrantyJobBills_B_fkey" FOREIGN KEY ("B") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

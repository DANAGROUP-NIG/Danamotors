-- Historical collection confirmations remain readable; no signatures are fabricated.
CREATE TABLE "PartCollectionSignature" (
  "issuanceId" TEXT NOT NULL PRIMARY KEY REFERENCES "PartIssuance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "signerId" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentHash" CHAR(64) NOT NULL,
  "signatureImage" TEXT NOT NULL,
  CONSTRAINT "PartCollectionSignature_image_size" CHECK (octet_length("signatureImage") <= 88000)
);

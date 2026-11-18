-- Web-driven handheld jobs (2026-10-28): count sheets join the handheld queue, and a job is queued
-- before it reaches a handheld and received before it is posted. Enum values are added in their own
-- migration because PostgreSQL cannot use a new enum value in the transaction that adds it.

ALTER TYPE "HandheldDocumentType" ADD VALUE 'COUNT_SHEET';
ALTER TYPE "HandheldDocumentStatus" ADD VALUE 'QUEUED' BEFORE 'SENT';
ALTER TYPE "HandheldDocumentStatus" ADD VALUE 'RECEIVED' BEFORE 'UPLOADED';

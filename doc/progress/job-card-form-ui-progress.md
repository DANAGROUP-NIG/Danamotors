# Job card form UI and submission error
- Added closed-by-default customer, vehicle and delivery cards using the existing card component, with clearer headers and divided content.
- Client validation expands cards containing invalid fields before focusing them.
- Mileage submission cause remains unconfirmed; requested the exact error and stack trace before changing submission logic.
- Scoped ESLint run using installed Node directly after the default Node shim reported no configured version.
- Confirmed conversion failure: params-only route validation overwrote req.body with undefined, causing input.mileage to throw.
- Conversion route now validates and preserves a record body; existing jobOpeningBody validation still checks merged booking/opening fields in the service.
- Added route regression test for retaining mileage and other opening fields.
- Verification: booking.routes.test.ts passed all 3 tests with ts-jest TypeScript diagnostics enabled; git diff --check passed. PowerShell labeled Jest stderr as NativeCommandError despite the passing Jest result.

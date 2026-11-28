export type SlipKind = 'requisitions' | 'return-slips' | 'labour-slips';
export const slipRoutes = { requisitions: '/inventory/requisitions', 'return-slips': '/inventory/return-slips', 'labour-slips': '/service/labour-slips' };
export const slipKeys = { requisitions: 'requisition', 'return-slips': 'returnSlip', 'labour-slips': 'labourSlip' };

export function signatureFieldsValid(fields: {drawn:boolean;name:string;customerName:string;relationship:string;approved:boolean;reason:string}): boolean {
 return fields.drawn && !!fields.name.trim() && (fields.name.trim().toLowerCase() === fields.customerName.trim().toLowerCase() || !!fields.relationship.trim()) && (fields.approved || !!fields.reason.trim());
}

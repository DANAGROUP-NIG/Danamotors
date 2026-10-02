/**
 * @openapi
 * {
 *   "/workshop-masters": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Search active workshop masters; page/limit pagination",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       }
 *     },
 *     "post": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Admin: create a master (codes are preserved)",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "requestBody": {
 *         "required": true,
 *         "content": {
 *           "application/json": {
 *             "example": {
 *               "kind": "SERVICE_TYPE",
 *               "code": "PS",
 *               "description": "Paid service",
 *               "chargedTo": "CUSTOMER",
 *               "active": true
 *             }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "/workshop-masters/{id}": {
 *     "put": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Admin: edit or deactivate a master; hierarchy cannot be reparented",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "requestBody": {
 *         "required": true,
 *         "content": {
 *           "application/json": {
 *             "example": {
 *               "active": false
 *             }
 *           }
 *         }
 *       },
 *       "parameters": [
 *         {
 *           "in": "path",
 *           "name": "id",
 *           "required": true,
 *           "schema": {
 *             "type": "string",
 *             "format": "uuid"
 *           }
 *         }
 *       ]
 *     }
 *   },
 *   "/customers/duplicates": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Find possible duplicates by mobile, name or company; does not prevent creation",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       }
 *     }
 *   },
 *   "/customers/{id}/merge": {
 *     "post": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Admin: move this duplicate into the kept customer and retain an audit record",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "requestBody": {
 *         "required": true,
 *         "content": {
 *           "application/json": {
 *             "example": {
 *               "targetId": "00000000-0000-4000-8000-000000000001"
 *             }
 *           }
 *         }
 *       },
 *       "parameters": [
 *         {
 *           "in": "path",
 *           "name": "id",
 *           "required": true,
 *           "schema": {
 *             "type": "string",
 *             "format": "uuid"
 *           }
 *         }
 *       ]
 *     }
 *   },
 *   "/service/staff": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Search active service advisors or technicians in a branch",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       }
 *     }
 *   },
 *   "/service/vehicles/{id}/recent-jobs": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Recent jobs for repeat assessment (JOB_REPEAT_WINDOW_DAYS)",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "parameters": [
 *         {
 *           "in": "path",
 *           "name": "id",
 *           "required": true,
 *           "schema": {
 *             "type": "string",
 *             "format": "uuid"
 *           }
 *         }
 *       ]
 *     }
 *   },
 *   "/service/labour-rates": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "List model labour rates",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       }
 *     },
 *     "post": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Admin: create or replace an operation/model rate",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "requestBody": {
 *         "required": true,
 *         "content": {
 *           "application/json": {
 *             "example": {
 *               "labourItemId": "00000000-0000-4000-8000-000000000001",
 *               "modelId": "00000000-0000-4000-8000-000000000002",
 *               "pricing": "TIME",
 *               "hours": 1.5,
 *               "rate": 15000,
 *               "active": true
 *             }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "/service/job-cards/{id}/credit-approval": {
 *     "post": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Branch admin: approve credit delivery for a READY job with an audit reason",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       },
 *       "requestBody": {
 *         "required": true,
 *         "content": {
 *           "application/json": {
 *             "example": {
 *               "remarks": "Approved corporate credit terms"
 *             }
 *           }
 *         }
 *       },
 *       "parameters": [
 *         {
 *           "in": "path",
 *           "name": "id",
 *           "required": true,
 *           "schema": {
 *             "type": "string",
 *             "format": "uuid"
 *           }
 *         }
 *       ]
 *     }
 *   },
 *   "/portal/catalogue": {
 *     "get": {
 *       "tags": [
 *         "Workshop"
 *       ],
 *       "summary": "Customer portal: search vehicle catalogue only",
 *       "security": [
 *         {
 *           "BearerAuth": []
 *         }
 *       ],
 *       "responses": {
 *         "200": {
 *           "description": "Successful operation"
 *         },
 *         "400": {
 *           "description": "Validation or business-rule failure"
 *         },
 *         "403": {
 *           "description": "Insufficient permission"
 *         }
 *       }
 *     }
 *   }
 * }
 */
export const workshopOpenApi = true;

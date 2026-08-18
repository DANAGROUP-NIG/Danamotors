export type EnquiryStatus = 'Pending' | 'Approved' | 'Rejected' | 'Converted';

export type CreateEnquiryPayload = {
  firstName:          string;
  lastName:           string;
  email:              string;
  phoneNumber:        string;
  vehicleMake?:       string;
  vehicleModel?:      string;
  vehicleYear?:       number;
  vehicleRegNumber?:  string;
  serviceDescription: string;
  preferredDate?:     string;  // ISO 8601
  branchId:           string;
};

export type CreateEnquiryResponse = {
  enquiry: {
    id:        string;
    status:    EnquiryStatus;
    createdAt: string;
  };
};
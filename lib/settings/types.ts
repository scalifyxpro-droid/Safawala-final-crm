export type ProfileSettings = {
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  designation: string | null;
  department: string | null;
  employee_id: string | null;
  date_of_joining: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  language_preference: string;
};

export type BankAccount = {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  branch_name: string | null;
  upi_id: string | null;
  qr_code_image: string | null;
  is_primary: boolean;
  created_at: string;
};

export type PublicBankDetails = {
  bank: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upi: string;
  qrCodeImage: string | null;
};

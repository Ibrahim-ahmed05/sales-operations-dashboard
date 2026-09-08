import raw from "@/data/dataset.json";

export interface OrderRow {
  id: string;
  cid: string;
  cn: string;
  d: string;
  m: string;
  st: string;
  ch: string;
  rev: number;
  ret: number;
  gp: number;
  ds: string;
  delay: number;
  lead: number | null;
  overdueOpen: boolean;
  total: number;
}

export interface InvoiceRow {
  id: string;
  oid: string;
  cid: string;
  cn: string;
  date: string;
  m: string;
  due: string;
  amt: number;
  paid: number;
  out: number;
  status: string;
  overdueDays: number;
  bucket: string;
}

export interface InventoryRow {
  pid: string;
  sku: string;
  name: string;
  category: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  avail: number;
  reorder: number;
  preferred: number;
  leadTime: number;
  state: "In Stock" | "Low Stock" | "Out of Stock" | "Discrepancy";
  value: number;
  unitPrice: number;
  margin: number;
}

export interface ProductRow {
  pid: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  margin: number;
}

export interface CustomerRow {
  cid: string;
  name: string;
  industry: string;
  city: string;
  segment: string;
  terms: number;
  creditLimit: number;
  status: string;
}

export interface ProductMonthRow {
  m: string;
  pid: string;
  rev: number;
  qty: number;
  gp: number;
}

export interface ReturnRow {
  id: string;
  oid: string;
  pid: string;
  m: string;
  date: string;
  qty: number;
  reason: string;
  amount: number;
  status: string;
}

export interface Dataset {
  referenceDate: string;
  currency: string;
  months: string[];
  orders: OrderRow[];
  invoices: InvoiceRow[];
  inventory: InventoryRow[];
  products: ProductRow[];
  customers: CustomerRow[];
  productMonthly: ProductMonthRow[];
  returns: ReturnRow[];
}

export const dataset = raw as unknown as Dataset;

export const CANCELLED = "Cancelled";

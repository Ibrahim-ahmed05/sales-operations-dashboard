"""Import the supplied ZIP into the specification's relational model; never repair invalid rows."""
import csv, io, json, sqlite3, sys, zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'sales_operations_demo_dataset_UPDATED.zip'
output = Path(sys.argv[2]) if len(sys.argv)>2 else root/'var/dashboard.sqlite'
output.parent.mkdir(parents=True,exist_ok=True)
today = date.today().isoformat()
z = zipfile.ZipFile(source)
read = lambda name: list(csv.DictReader(io.TextIOWrapper(z.open(name+'.csv'),encoding='utf-8-sig')))
money = lambda value: int(Decimal(value or '0')*100) if Decimal(value or '0')*100 == (Decimal(value or '0')*100).to_integral() else (_ for _ in ()).throw(ValueError('Money has fractions smaller than paisa'))
def day(v, future=False):
    if not v: return None
    date.fromisoformat(v)
    if not future and v>today: raise ValueError('Transaction date is in the future')
    return v
report={'source':source.name,'importedAt':today,'accepted':{},'rejected':{},'issues':[], 'mappings':['Money stored as integer paisa (PKR × 100).','Customer type uses customer_segment; region uses city.','Invoice state derived from invoice and paid amounts; paid date is final payment date.','Movement codes map to Stock In, Stock Out, Adjustment, Return; original type retained.','Future due/required dates are contractual dates, not completed transaction timestamps.','Confirmed and Partially Returned are rejected: not in the six allowed order statuses.']}
db=sqlite3.connect(output)
db.executescript('''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT,region TEXT,created_date TEXT);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT,sku TEXT,category TEXT,unit_price INTEGER,unit_cost INTEGER,reorder_threshold INTEGER,active INTEGER);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES customers(id),order_date TEXT,status TEXT CHECK(status IN ('Pending','Processing','Shipped','Delivered','Cancelled','Returned')),delivered_date TEXT,shipped_date TEXT,required_date TEXT,total INTEGER);
CREATE TABLE IF NOT EXISTS lines(id TEXT PRIMARY KEY,order_id TEXT REFERENCES orders(id),product_id TEXT REFERENCES products(id),quantity INTEGER CHECK(quantity>0),unit_price INTEGER,unit_cost INTEGER,return_flag INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory(product_id TEXT PRIMARY KEY REFERENCES products(id),on_hand INTEGER,reserved INTEGER,warehouse TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS movements(id TEXT PRIMARY KEY,product_id TEXT REFERENCES products(id),type TEXT,source_type TEXT,quantity INTEGER,movement_date TEXT,reference TEXT);
CREATE TABLE IF NOT EXISTS receivables(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES customers(id),order_id TEXT REFERENCES orders(id),invoice_date TEXT,due_date TEXT,amount INTEGER,paid INTEGER,paid_date TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,invoice_id TEXT REFERENCES receivables(id),payment_date TEXT,amount INTEGER);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT);
CREATE INDEX IF NOT EXISTS orders_date_status_customer ON orders(order_date,status,customer_id);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS lines_order_product ON lines(order_id,product_id);
CREATE INDEX IF NOT EXISTS lines_product ON lines(product_id);
CREATE INDEX IF NOT EXISTS movements_product_date ON movements(product_id,movement_date);
CREATE INDEX IF NOT EXISTS receivables_due_status ON receivables(due_date,status);
CREATE INDEX IF NOT EXISTS receivables_invoice_date ON receivables(invoice_date);
CREATE INDEX IF NOT EXISTS receivables_paid_date ON receivables(paid_date);
CREATE INDEX IF NOT EXISTS payments_invoice_date ON payments(invoice_id,payment_date);
''')
if db.execute('SELECT COUNT(*) FROM orders').fetchone()[0]:
    raise SystemExit('Database already contains data. Choose a new output path to import; existing data was not overwritten.')
def insert(table, rows, transform):
    report['accepted'][table]=0;report['rejected'][table]=0
    for r in rows:
        try:
            values=transform(r)
            db.execute('INSERT INTO '+table+' VALUES ('+','.join('?' for _ in values)+')',values)
            report['accepted'][table]+=1
        except (ValueError,sqlite3.IntegrityError,KeyError) as e:
            report['rejected'][table]+=1
            report['issues'].append({'table':table,'id':next(iter(r.values())),'reason':str(e)})
insert('customers',read('customers'),lambda r:(r['customer_id'],r['customer_name'],r['customer_segment'],r['city'],day(r['created_at'])))
insert('products',read('products'),lambda r:(r['product_id'],r['product_name'],r['sku'],r['category'],money(r['unit_price']),money(r['unit_cost']),int(r['reorder_level']),int(r['product_status']=='Active')))
insert('orders',read('orders'),lambda r:(r['order_id'],r['customer_id'],day(r['order_date']),r['order_status'],day(r['delivered_date']),day(r['shipped_date']),day(r['required_date'],True),money(r['total_amount'])))
insert('lines',read('order_items'),lambda r:(r['order_item_id'],r['order_id'],r['product_id'],int(r['quantity']),money(r['unit_price']),money(r['unit_cost']),0))
movements=read('stock_movements')
last_movement=max(r['movement_date'] for r in movements)
insert('inventory',read('inventory'),lambda r:(r['product_id'],int(r['quantity_on_hand']),int(r['quantity_reserved']),r['warehouse'],last_movement))
types={'OPENING_BALANCE':'Adjustment','SALE':'Stock Out','PURCHASE_RECEIPT':'Stock In','CUSTOMER_RETURN':'Return','STOCK_RECONCILIATION':'Adjustment','DAMAGE':'Adjustment'}
insert('movements',movements,lambda r:(r['movement_id'],r['product_id'],types[r['movement_type']],r['movement_type'],int(r['quantity_change']),day(r['movement_date']),r['reference_id']))
payments=read('payments'); paid_dates={}
for r in payments: paid_dates[r['invoice_id']]=max(paid_dates.get(r['invoice_id'],''),r['payment_date'])
def invoice(r):
    amount=money(r['invoice_amount']); paid=money(r['amount_paid'])
    if paid<0 or paid>amount: raise ValueError('Paid amount outside invoice balance')
    return (r['invoice_id'],r['customer_id'],r['order_id'],day(r['invoice_date']),day(r['due_date'],True),amount,paid,day(paid_dates.get(r['invoice_id'],'')) if amount==paid else None,'Paid' if amount==paid else 'Partially Paid' if paid else 'Unpaid')
insert('receivables',read('receivables'),invoice)
insert('payments',payments,lambda r:(r['payment_id'],r['invoice_id'],day(r['payment_date']),money(r['payment_amount'])))
report['inventoryReconciliationErrors']=db.execute('SELECT COUNT(*) FROM inventory i WHERE i.on_hand != (SELECT COALESCE(SUM(quantity),0) FROM movements m WHERE m.product_id=i.product_id)').fetchone()[0]
report['paymentReconciliationErrors']=db.execute('SELECT COUNT(*) FROM receivables r WHERE paid != (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=r.id)').fetchone()[0]
report['statusHistoryAvailable']=False
report['notes']=['Average time in each status is unavailable: source has no status transition history.','Inventory turnover uses daily closing inventory at supplied unit cost. Movement history reconciles to current on-hand.','Retail/wholesale is unavailable: source provides Enterprise, SME and other customer segments instead.']
for key,value in {'importReport':report,'sourceLastOrderDate':db.execute('SELECT MAX(order_date) FROM orders').fetchone()[0],'inventoryUpdatedAt':last_movement}.items():db.execute('INSERT INTO metadata VALUES (?,?)',(key,json.dumps(value)))
db.commit();db.close()
(root/'var/import-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['issues']},indent=2))

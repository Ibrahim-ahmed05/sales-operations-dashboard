# Independent decimal reference calculations from the original CSV files.
import csv,io,json,zipfile
from decimal import Decimal
from datetime import date
z=zipfile.ZipFile('../sales_operations_demo_dataset_UPDATED.zip')
r=lambda n:list(csv.DictReader(io.TextIOWrapper(z.open(n+'.csv'))))
n=lambda v:int(Decimal(v)*100)
allowed={'Pending','Processing','Shipped','Delivered','Cancelled','Returned'}
orders=[o for o in r('orders') if o['order_status'] in allowed]; ids={o['order_id'] for o in orders};valid={o['order_id'] for o in orders if o['order_status']!='Cancelled'}
lines=[l for l in r('order_items') if l['order_id'] in valid]
invs=[i for i in r('receivables') if i['order_id'] in ids]
today=date.today().isoformat()
out={'sales':sum(int(l['quantity'])*n(l['unit_price']) for l in lines),'orders':len(valid),'placed':len(orders),'pending':sum(o['order_status'] in ['Pending','Processing'] for o in orders),'delivered':sum(o['order_status']=='Delivered' for o in orders),'cancelled':sum(o['order_status']=='Cancelled' for o in orders),'outstanding':sum(n(i['invoice_amount'])-n(i['amount_paid']) for i in invs),'overdue':sum(n(i['invoice_amount'])-n(i['amount_paid']) for i in invs if i['due_date']<today and n(i['invoice_amount'])>n(i['amount_paid'])),'overdueCount':sum(i['due_date']<today and n(i['invoice_amount'])>n(i['amount_paid']) for i in invs)}
open('var/expected.json','w').write(json.dumps(out));print(out)

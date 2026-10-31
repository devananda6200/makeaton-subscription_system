import { hashPassword } from './auth.mjs';
import { insert, transaction } from './db.mjs';
import { today, addDays, password, email } from './domain.mjs';
import { createSubscription } from './subscriptions.mjs';
import { runBilling, invoiceAction, recordPayment } from './billing.mjs';

export async function initializeData(db, demo) {
  db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const seededDemo = db.prepare("SELECT value FROM app_meta WHERE key='demo'").get()?.value === 'true';
  if (!demo && seededDemo && process.env.NODE_ENV === 'production') throw new Error('Use a fresh DATABASE_PATH for production; this database contains demonstration accounts.');
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return seededDemo;
  if (!demo) {
    const adminEmail = email.parse(process.env.ADMIN_EMAIL);
    const adminPassword = password.parse(process.env.ADMIN_PASSWORD);
    insert(db,'users',{name:'Workspace admin',email:adminEmail,password_hash:await hashPassword(adminPassword),role:'admin'});
    return false;
  }
  const hash = await hashPassword('LoopDemo!2026');
  const day = today();
  transaction(db,()=>{
    insert(db,'app_meta',{key:'demo',value:'true'});
    insert(db,'taxes',{name:'GST 18%',rate_bps:1800});
    insert(db,'taxes',{name:'GST 5%',rate_bps:500});
    insert(db,'taxes',{name:'Zero rated',rate_bps:0});
    const products = [
      ['Workspace seats','software',39900,12000,'A shared home for projects, people, and ideas.',[{name:'Standard',extra:0},{name:'Odoo',extra:56000}]],
      ['Workflow automation','addon',14900,4000,'Make busywork disappear with connected workflows.',[]],
      ['Advanced analytics','addon',29900,8000,'Turn product activity into clear business decisions.',[{name:'Standard',extra:0},{name:'Pro',extra:19900}]],
      ['Priority support','service',199900,65000,'A dedicated success partner for your growing team.',[]],
    ];
    for(const [name,type,price,cost,notes,variants] of products)insert(db,'products',{name,type,price,cost,notes,variants:JSON.stringify(variants),tax_id:1});
    for(const [name,description,price,interval,min_quantity] of [
      ['Launch','Everything a small team needs to get moving.',49900,'monthly',1],
      ['Growth','More room for ambitious teams and bigger ideas.',149900,'monthly',5],
      ['Scale Annual','Your next chapter, with a full year of possibility.',1499900,'yearly',10],
      ['Flex Weekly','A flexible workspace for short sprints.',19900,'weekly',1],
      ['Day Pass','A little room to try something great.',4900,'daily',1],
    ])insert(db,'plans',{name,description,price,interval,min_quantity,available_from:'2020-01-01',tax_id:1,auto_close:1,allow_pause:1,allow_close:1,allow_renew:1});
    insert(db,'templates',{name:'Small team starter',plan_id:1,valid_days:30,lines:JSON.stringify([{product_id:1,quantity:3,variant:'Standard'}])});
    insert(db,'templates',{name:'Growth team bundle',plan_id:2,valid_days:21,lines:JSON.stringify([{product_id:1,quantity:8,variant:'Standard'},{product_id:2,quantity:1,variant:''},{product_id:3,quantity:1,variant:'Pro'}])});
    insert(db,'templates',{name:'Annual enterprise offer',plan_id:3,valid_days:45,lines:JSON.stringify([{product_id:1,quantity:20,variant:'Odoo'},{product_id:4,quantity:1,variant:''}])});
    const companies=['Acme Studio','Orbit Labs','Pixel & Co.','Northstar','Horizon Works','CloudNine','Apex Digital','Studio Linear','Kindred Collective','Nimble Technologies','Paperplane','Form & Function','Ember Labs','Evergreen Studio','Monday Makers','Goodfolk','Atlas Creative','Summit Systems','Clover Commerce','Tandem Design','Craft & Code','Mosaic Studio','Lumen Ventures','Fieldwork'];
    const names=['Alex Morgan','Priya Sharma','Jamie Chen','Sam Rivera','Riley Brooks','Avery Singh','Jordan Park','Taylor James','Casey Patel','Morgan Lee','Drew Wilson','Robin Shah','Charlie Kim','Dakota Reed','Quinn Das','Cameron West','Skyler Roy','Harper Stone','Reese Taylor','Rowan Kapoor','Finley Ellis','Sage Kumar','Blake Davis','Parker Jain'];
    companies.forEach((company,i)=>insert(db,'customers',{name:names[i],company,email:i===0?'customer@brightloop.demo':`hello${i+1}@example.com`,phone:`+91 90000 ${String(10000+i)}`,address:'Bengaluru, Karnataka, India'}));
    insert(db,'users',{name:'Jamie Wilson',email:'admin@brightloop.demo',password_hash:hash,role:'admin'});
    insert(db,'users',{name:'Sam Taylor',email:'staff@brightloop.demo',password_hash:hash,role:'staff'});
    insert(db,'users',{name:names[0],email:'customer@brightloop.demo',password_hash:hash,role:'customer',customer_id:1});
  });
  const admin = db.prepare("SELECT * FROM users WHERE role='admin'").get();
  for(let i=0;i<30;i++) {
    const planId = i%8===0?3:i%3===0?2:1;
    const sub=createSubscription(db,{customer_id:i%24+1,plan_id:planId,start_date:addDays(day,-165+(i%6)*6),expiry_date:addDays(day,90+i*4),payment_terms:14,lines:[{product_id:1,quantity:planId===3?15:planId===2?8:2+i%4,variant:i%8===0?'Odoo':'Standard'},...(i%2===0?[{product_id:2,quantity:1,variant:''}]:[])]},admin);
    const status=i>=26?'draft':i>=24?'quotation':i>=22?'confirmed':'active';
    db.prepare('UPDATE subscriptions SET status=? WHERE id=?').run(status,sub.id);
  }
  insert(db,'discounts',{name:'Growing together · 10%',kind:'percentage',value:1000,min_purchase:200000,min_quantity:5,starts_on:addDays(day,-200),ends_on:addDays(day,120),usage_limit:500,product_id:1});
  insert(db,'discounts',{name:'Acme loyalty credit',kind:'fixed',value:25000,min_purchase:0,min_quantity:0,starts_on:day,ends_on:addDays(day,30),usage_limit:1,subscription_id:1});
  runBilling(db,admin,addDays(day,-7));
  const invoices=db.prepare('SELECT * FROM invoices ORDER BY cycle_date,id').all();
  invoices.forEach((invoice,i)=>{
    db.prepare('UPDATE invoices SET issued_on=? WHERE id=?').run(invoice.cycle_date,invoice.id);
    invoiceAction(db,invoice.id,'confirm',admin);
    if(invoice.cycle_date<addDays(day,-35)||i%4!==0) {
      const partial=invoice.cycle_date>=addDays(day,-35)&&i%7===0;
      recordPayment(db,invoice.id,{amount:partial?Math.floor(invoice.total/2):invoice.total,method:['bank_transfer','card','upi'][i%3],paid_on:[addDays(invoice.cycle_date,3),day].sort()[0],note:'Fictional receipt for the demo workspace',idempotency_key:`seed-payment-${invoice.id}`},admin);
    }
  });
  db.prepare("UPDATE subscriptions SET status='paused' WHERE id IN (20,21)").run();
  db.prepare("UPDATE subscriptions SET status='closed' WHERE id=22").run();
  insert(db,'audit_log',{user_id:admin.id,actor:admin.name,action:'Opened demo workspace',entity:'workspace',detail:'Fictional data · ready to explore'});
  return true;
}

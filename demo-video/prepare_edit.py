"""Prepare the Brightloop edit from genuine browser captures. No UI is fabricated."""
from pathlib import Path
import json, math, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'tmp/demo-capture'; WORK=ROOT/'tmp/demo-edit'; WORK.mkdir(exist_ok=True)
OUT=Path.home()/'Downloads/Brightloop-Demo'; OUT.mkdir(exist_ok=True)
# shot, seconds, chapter, headline, supporting caption, focus crop (optional)
ROWS=[
('intro',7,'BRIGHTLOOP','Less admin. More possibility.','The subscription workspace. From first hello to next renewal.',None),
('01-login',4,'01 / A SECURE START','One workspace. Every subscription.','A real browser walkthrough of Brightloop.',None),
('02-credentials',4,'01 / A SECURE START','Sign in. Step into control.','Normal administrator authentication. Clear role permissions.',(900,260,1740,1080)),
('03-overview',8,'02 / THE BIG PICTURE','Your business, at a glance.','Recurring revenue. Active subscriptions. Cash collected. What needs attention.',None),
('04-products',5,'03 / BUILD YOUR OFFER','Everything you offer. Connected.','Products, services, and add-ons in one searchable catalog.',None),
('05-product-detail',6,'03 / BUILD YOUR OFFER','The details make the difference.','Sales and cost prices. Product variants. Surcharges. Tax rules.',(600,240,1320,1136)),
('06-plans',6,'03 / BUILD YOUR OFFER','A rhythm for every customer.','Daily, weekly, monthly, or annual billing.',None),
('07-plan-rules',6,'03 / BUILD YOUR OFFER','Flexible plans. Clear boundaries.','Minimum quantities, availability, pause, renewal, and closure policies.',(560,220,1360,1136)),
('08-templates',5,'04 / FROM OFFER TO ACTIVE','Your best offer. Ready again.','Reusable quotation templates bundle plans, products, and validity.',None),
('09-template-draft',7,'04 / FROM OFFER TO ACTIVE','A head start on the next hello.','Choose a customer. The bundle fills in the rest.',(480,120,1440,1136)),
('10-subscriptions',4,'04 / FROM OFFER TO ACTIVE','One relationship. One clear story.','Search and filter every subscription by its lifecycle stage.',None),
('11-lifecycle-draft',3,'04 / FROM OFFER TO ACTIVE','Start with a draft.','A numbered subscription with its terms and product lines.',(540,220,1380,1136)),
('12-lifecycle-quotation',3,'04 / FROM OFFER TO ACTIVE','Make it a quotation.','The offer moves forward with an explicit validity date.',(540,220,1380,1136)),
('13-lifecycle-confirmed',3,'04 / FROM OFFER TO ACTIVE','Confirm the agreement.','Each transition follows the subscription lifecycle.',(540,220,1380,1136)),
('14-lifecycle-active',4,'04 / FROM OFFER TO ACTIVE','And bring it to life.','Activated. Ready for its first billing cycle.',(540,220,1380,1136)),
('15-discounts',5,'05 / BILLING THAT ADDS UP','A little extra reason to stay.','Percentage offers and fixed credits, applied automatically.',None),
('16-discount-rules',6,'05 / BILLING THAT ADDS UP','The right offer. On the right invoice.','Control dates, usage, minimums, and product or subscription scope.',(560,220,1360,1136)),
('18-billing-run',6,'05 / BILLING THAT ADDS UP','Close the billing loop.','Due cycles become draft invoices. Existing cycles are never billed twice.',(620,450,1300,1040)),
('19-billing-result',4,'05 / BILLING THAT ADDS UP','Calculated. Ready for review.','Products, eligible discounts, and taxes come together automatically.',(620,450,1300,1040)),
('20-invoice-breakdown',8,'05 / BILLING THAT ADDS UP','Every line. Every rupee.','An itemized invoice with transparent discounts, tax, and totals.',(480,180,1440,1136)),
('21-invoice-confirmed',4,'06 / CLOSE THE LOOP','Review. Confirm. Collect.','Email the invoice, send a reminder, or record a receipt.',(480,180,1440,1136)),
('22-payment-form',7,'06 / CLOSE THE LOOP','Match the money to the moment.','Record full or partial receipts with a method, date, and reference.',(630,350,1290,1136)),
('23-invoice-paid',6,'06 / CLOSE THE LOOP','Paid. With a complete trail.','The balance reaches zero and the receipt stays linked to its invoice.',(480,180,1440,1136)),
('24-print-invoice',6,'06 / CLOSE THE LOOP','Ready to share. Ready to file.','A clean, printable invoice with browser Save as PDF.',(460,60,1460,1100)),
('25-payments',5,'06 / CLOSE THE LOOP','Every receipt, accounted for.','A searchable ledger. This records received funds; it does not charge cards.',None),
('26-customers',5,'07 / KNOW YOUR BUSINESS','The people behind your growth.','Customer records, new subscriptions, and portal invitations.',None),
('27-reports',8,'07 / KNOW YOUR BUSINESS','See the bigger picture.','MRR, annual run rate, collections, overdue balances, and upcoming renewals.',None),
('28-filtered-report',6,'07 / KNOW YOUR BUSINESS','Find the signal. Share the insight.','Filter by date and plan. Export the report as CSV.',None),
('29-audit',5,'07 / KNOW YOUR BUSINESS','Nothing gets lost in the handoff.','An audit trail of subscription changes, billing runs, invoices, and receipts.',None),
('31-team',5,'08 / BUILT FOR PEOPLE','The right access for every role.','Administrators manage the workspace. Staff keep daily operations moving.',None),
('32-search',5,'08 / BUILT FOR PEOPLE','Find your way. Instantly.','Search a customer, company, subscription, or invoice from anywhere.',(550,220,1370,1050)),
('33-registration',5,'08 / BUILT FOR PEOPLE','Customers can start themselves.','Self-service registration with a strong-password policy.',(900,180,1740,1100)),
('34-password-reset',5,'08 / BUILT FOR PEOPLE','A fresh start. Securely.','Password recovery uses expiring, single-use links.',(900,200,1740,1080)),
('35-customer-login',3,'09 / THE CUSTOMER SIDE','A different role. Their own space.','Sign in as the customer to see only their records.',(900,260,1740,1080)),
('36-customer-portal',7,'09 / THE CUSTOMER SIDE','Their subscriptions. Their next steps.','A dedicated portal for balances, invoices, and subscription details.',None),
('37-customer-controls',5,'09 / THE CUSTOMER SIDE','More control. Fewer support tickets.','Eligible subscriptions can be paused, resumed, renewed, or closed.',(540,220,1380,1136)),
('38-addons',7,'09 / THE CUSTOMER SIDE','Make the next cycle work for you.','Manage add-ons for future billing. Existing invoices retain their original amounts.',(540,80,1380,1136)),
('39-paused',4,'09 / THE CUSTOMER SIDE','Pause when life changes.','A real customer action updates the subscription state.',(540,220,1380,1136)),
('40-renewal',5,'09 / THE CUSTOMER SIDE','Give the relationship more room.','Choose an explicit expiry date for the renewed term.',(540,100,1380,1136)),
('41-live-email',8,'10 / LIVE AND CONNECTED','Every message, in the loop.','Live Brevo delivery: invoices, invitations, and resets. Persistent anti-spam limits.',None),
('outro',8,'BRIGHTLOOP','Less busywork. More bright ideas.','Explore the live product: brightloop-subscriptions.onrender.com',None),
]
FONT=Path('C:/Windows/Fonts')
def font(size,bold=False): return ImageFont.truetype(str(FONT/('segoeuib.ttf' if bold else 'segoeui.ttf')),size)
y,x=np.mgrid[0:1440,0:1920]; glow=np.exp(-((x-1500)**2+(y-300)**2)/700000); glow2=np.exp(-((x-200)**2+(y-1300)**2)/500000)
a=np.zeros((1440,1920,3),dtype=np.uint8)
for ch,base in enumerate([12,13,23]): a[:,:,ch]=np.clip(base+glow*[35,20,65][ch]+glow2*[5,18,30][ch],0,255)
BG=Image.fromarray(a)
def text(draw,xy,txt,size=34,color='#f6f5ff',bold=False): draw.text(xy,txt,font=font(size,bold),fill=color)
def center(draw,y,txt,size,color='#f6f5ff',bold=False):
 f=font(size,bold);w=draw.textlength(txt,font=f);draw.text(((1920-w)/2,y),txt,font=f,fill=color)
configs=[]; timeline=[]; time=0
for i,(shot,seconds,chapter,title,caption,crop) in enumerate(ROWS):
 canvas=BG.copy();d=ImageDraw.Draw(canvas)
 if shot in ['intro','outro']:
  center(d,410,'brightloop.',128,bold=True)
  d.rounded_rectangle((856,600,1064,607),radius=4,fill='#aa91ff')
  center(d,675,title,66,bold=True)
  center(d,790,caption,32,color='#c2bfd5')
  center(d,1050,'SUBSCRIPTION MANAGEMENT, BEAUTIFULLY CONNECTED',24,color='#a99ccf')
  if shot=='intro': center(d,1125,'Captured from the working product • Fictional demonstration data',25,color='#8f8ba4')
 else:
  text(d,(112,70),chapter,24,'#b6a1fc',True)
  text(d,(112,122),title,60,bold=True)
  text(d,(112,209),caption,29,'#cbc8da')
  im=Image.open(RAW/(shot+'.png')).convert('RGB')
  if shot=='41-live-email':
   # Privacy redaction only. Status, subjects, and timestamps remain unchanged.
   sw,sh=im.size
   for row in [278,394,510,626]:
    box=(int(sw*325/1265),int(sh*(row-9)/712),int(sw*460/1265),int(sh*(row+10)/712))
    im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(9)),box)
  if crop: im=im.crop(crop)
  im.thumbnail((1696,1010),Image.Resampling.LANCZOS)
  px=(1920-im.width)//2;py=310+(1010-im.height)//2
  shadow=Image.new('RGBA',(1920,1440));sd=ImageDraw.Draw(shadow);sd.rounded_rectangle((px-6,py-4,px+im.width+6,py+im.height+16),26,fill=(0,0,0,180));shadow=shadow.filter(ImageFilter.GaussianBlur(20));canvas=Image.alpha_composite(canvas.convert('RGBA'),shadow)
  mask=Image.new('L',im.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,im.width,im.height),18,fill=255);canvas.paste(im,(px,py),mask)
  d=ImageDraw.Draw(canvas);text(d,(112,1370),'BRIGHTLOOP  /  PRODUCT WALKTHROUGH',20,'#9690ac');text(d,(1740,1370),f'{i:02d} / 39',20,'#9690ac')
 path=WORK/(shot+'.png');canvas.convert('RGB').save(path)
 # Gentle editorial camera drift. Cursor highlights real interface regions;
 # clicks are reserved for the actual login, lifecycle, billing and receipt actions.
 target=[1080,840];start=[850,950]; clicks=[]
 real_clicks={'02-credentials':(1476,818),'35-customer-login':(1476,818),'13-lifecycle-confirmed':(820,1107),'18-billing-run':(1183,951),'22-payment-form':(1179,1029)}
 if shot in real_clicks:
  rx,ry=real_clicks[shot]; cw=(crop[2]-crop[0]) if crop else Image.open(RAW/(shot+'.png')).width
  ch=(crop[3]-crop[1]) if crop else Image.open(RAW/(shot+'.png')).height
  scale=min(1696/cw,1010/ch,1);target=[px+(rx-(crop[0] if crop else 0))*scale,py+(ry-(crop[1] if crop else 0))*scale];clicks=[seconds-.2]
 if shot in ['intro','outro']: target=start=[-1000,-1000]
 config={'duration':seconds,'fps':60,'source_size':[1920,1440],'output_size':[1920,1440],
 'cursor_asset':str(RAW/'cursor.png'),'cursor_hotspot':[3,2],'cursor_scale':1.3,'click_strength':15,'rotation_strength_degrees':5,
 'shots':{shot:str(path), 'previous':str(WORK/(ROWS[i-1][0]+'.png')) if i else str(path)},'scene_starts':[[0,'previous','fade'],[0,shot,'fade']],
 'cursor_keys':[[0,*start],[1.6,*target],[seconds,*target]],
 'camera_keys':[[0,960,720,1.0 if i%2==0 else 1.055],[seconds,960,720,1.055 if i%2==0 else 1.0]],
 'click_times':clicks,'preset':'veryfast','crf':18}
 cp=WORK/f'{i:02d}.json';cp.write_text(json.dumps(config,indent=2));configs.append(str(cp))
 timeline.append({'start':time,'duration':seconds,'shot':shot,'chapter':chapter,'title':title,'caption':caption});time+=seconds
(ROOT/'demo-video/timeline.json').write_text(json.dumps(timeline,indent=2),encoding='utf8')
(WORK/'jobs.json').write_text(json.dumps(configs));(WORK/'metadata.json').write_text(json.dumps({'duration':time,'output':str(OUT)}))
# Original, deterministic ambient score. No third-party music or paid service.
sr=48000; count=int(time*sr); audio=np.zeros((count,2),dtype=np.float32)
chords=[[130.8128,164.8138,195.9977,246.9417],[110,130.8128,164.8138,195.9977],[87.3071,130.8128,174.6141,220],[97.9989,146.8324,195.9977,246.9417]]
for k,start_s in enumerate(np.arange(0,time,8)):
 length=min(10,time-start_s);t=np.arange(int(length*sr))/sr;env=np.minimum(t/2,1)*np.minimum((length-t)/2,1)
 for j,freq in enumerate(chords[k%4]):
  tone=(np.sin(2*np.pi*freq*t)+.16*np.sin(2*np.pi*2*freq*t))*.023*env
  a0=int(start_s*sr);audio[a0:a0+len(t),0]+=tone*(.75+.25*math.sin(j));audio[a0:a0+len(t),1]+=tone*(.75+.25*math.cos(j))
 for beat in range(4):
  a0=int((start_s+beat*2)*sr);n=min(int(sr*1.7),count-a0)
  if n<=0:continue
  t=np.arange(n)/sr;f=chords[k%4][beat]*4;bell=.018*np.sin(2*np.pi*f*t)*np.exp(-t*3)*np.minimum(t/.015,1)
  audio[a0:a0+n,beat%2]+=bell;audio[a0:a0+n,1-beat%2]+=bell*.45
fade=np.minimum(np.arange(count)/sr/4,1)*np.minimum((count-np.arange(count))/sr/5,1);audio*=fade[:,None]
with wave.open(str(WORK/'score.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
def stamp(s):return f'{int(s//3600):02d}:{int(s%3600//60):02d}:{int(s%60):02d},000'
(OUT/'Brightloop-captions.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(r['start'])} --> {stamp(r['start']+r['duration'])}\n{r['title']}\n{r['caption']}" for i,r in enumerate(timeline)),encoding='utf8')
print(json.dumps({'seconds':time,'shots':len(ROWS),'output':str(OUT)}))

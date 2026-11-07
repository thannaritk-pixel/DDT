# DDT Web App (Google Apps Script + Google Sheet)

เว็บแอปสำหรับเก็บข้อมูล Delay Discounting Task บน iPad/มือถือ ข้อมูลบันทึกลง Google Sheet ใน Drive ของผู้วิจัยเอง
และ fit model (hyperbolic, exponential) ให้ทันทีหลังทำเสร็จ

## ไฟล์ที่ต้องใช้

| ไฟล์ | วางใน Apps Script เป็น |
|---|---|
| `Code.gs` | `Code.gs` |
| `dist/Index.html` | ไฟล์ HTML ชื่อ `Index` (ไม่ต้องพิมพ์ .html) |

`dist/Index.html` สร้างจาก `src/` และโค้ด task กลางใน `../task/` ด้วยคำสั่ง `node webapp/build.js`
ถ้าแก้โค้ดต้อง build ใหม่ทุกครั้ง แล้ววางไฟล์ใหม่

## ติดตั้ง (ทำบนคอมพิวเตอร์ ครั้งเดียว)

1. สร้าง Google Sheet ใหม่ เช่น "DDT Database" หรือใช้ไฟล์ที่ Claude สร้างให้
2. ในชีต ไปที่ **Extensions → Apps Script**
3. ลบโค้ดเดิมใน `Code.gs` แล้ววางเนื้อหาจาก `Code.gs`
4. กด **+ → HTML** ตั้งชื่อ `Index` แล้ววางเนื้อหาจาก `dist/Index.html`
5. กด 💾 Save
6. กด **Deploy → New deployment → ⚙ Select type → Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Only myself** (ใช้คนเดียว) หรือดูหัวข้อ "ใช้เป็นทีม"
7. กด **Deploy → Authorize access** เลือกบัญชี → **Advanced → Go to … (unsafe)** → **Allow**
8. คัดลอก URL ที่ลงท้ายด้วย `/exec`

> ลิงก์ใช้งานจะเกิดขึ้นหลังคุณกด Deploy เอง Claude สร้างลิงก์ให้ไม่ได้

เมื่อเปิดครั้งแรก แอปจะสร้างชีต `sessions`, `trials` และ `ตั้งค่า` ให้อัตโนมัติ

## ใช้บน iPad

1. เปิด URL `/exec` ใน **Safari** (ห้ามเปิดในเบราว์เซอร์ของ LINE)
2. login บัญชี Google ที่เป็นเจ้าของ Sheet หรือบัญชีที่ได้รับแชร์
3. กด **แชร์ → Add to Home Screen**
4. แนะนำให้เปิด **Guided Access** (Settings → Accessibility) ระหว่างให้ผู้เข้าร่วมทำ

ขั้นตอนต่อผู้เข้าร่วมหนึ่งคน:
1. แท็บ **เริ่ม**: ใส่ subjID, เลือกกลุ่ม, ครั้งที่ และ mode แล้วกดเริ่ม
2. ส่ง iPad ให้ผู้เข้าร่วมทำ (หน้าจอเต็ม ไม่มีแถบเมนู)
3. ทำเสร็จแล้ว ระบบบันทึกเองและขึ้น "✓ บันทึกลง Google Sheet แล้ว" กด **ดูผล (ผู้วิจัย)** เพื่อดูค่า k ได้
4. แท็บ **ข้อมูล**: ค้นหา แก้กลุ่ม/ครั้งที่ ติ๊ก exclude ใส่หมายเหตุ หรือลบ
5. แท็บ **สรุป**: ค่า log k แยกกลุ่ม และปุ่ม **ส่งออก CSV ไปที่ Google Drive** (โฟลเดอร์ `DDT exports`)

### ถ้าเน็ตหลุด

ข้อมูลจะเก็บไว้ในเครื่องก่อนส่งทุกครั้ง ถ้าส่งไม่สำเร็จ จะมีแถบสีเหลือง "มีข้อมูลค้างส่ง" ที่หน้าหลัก
กด **ส่งอีกครั้ง** เมื่อเน็ตกลับมา หรือเปิดแอปใหม่แล้วระบบจะลองส่งให้เอง (ส่งซ้ำได้โดยไม่เกิดข้อมูลซ้ำ)
แต่ต้องมีเน็ตตอนเปิดแอปครั้งแรก

## ตั้งค่า (ชีต `ตั้งค่า`)

| คอลัมน์ | ความหมาย |
|---|---|
| A: กลุ่ม | รายการกลุ่มใน dropdown เช่น control, MDD, AUD แก้/เพิ่มได้ |
| B: ครั้งที่ | baseline, follow-up, retest แก้/เพิ่มได้ |
| C–D: ค่า | `default_mode`, `scale`, `currency`, `practice`, `catch_trials`, `max_catch_fail` |

ค่าที่ส่งมาจากแอปจะถูกตรวจเทียบกับรายการนี้ทุกครั้ง

## ข้อมูลที่เก็บ

- **sessions**: 1 แถวต่อ 1 ครั้ง ได้แก่ จำนวนข้อ, catch fail, P(later), median RT, `k_hyp`, `log_k_hyp`, `beta_hyp`, `k_exp`,
  BIC, best model, Kirby k/consistency, AUC, Johnson & Bickel flag, exclude, note, เวลาเริ่ม/จบ, ผู้บันทึก
- **trials**: 1 แถวต่อ 1 ข้อ ใช้คอลัมน์ตาม hBayesDM (`subjID, delay_later, amount_later, delay_sooner, amount_sooner, choice`)
  พร้อม `session_id`, `group`, `session_label`, `rt_ms`, `is_catch` ฯลฯ ไม่เก็บข้อฝึกหัด

## วิเคราะห์ต่อด้วย Python

กด **ส่งออก CSV** แล้วดาวน์โหลด `ddt_trials_*.csv` จาก Drive (หรือ File → Download → CSV จากชีต `trials`)

```bash
cd analysis
python -m ddt.fit ddt_trials_20261107-1200.csv --out results.csv   # fit 4 โมเดลทีละ session
python -m ddt.compare results.csv                                     # เปรียบเทียบ log k ระหว่างกลุ่ม
```

session ที่ติ๊ก exclude จะถูกข้าม (ใช้ `--include-excluded` ถ้าต้องการรวม)
ค่า k ที่แสดงในแอปเป็นค่าเบื้องต้นจาก hyperbolic/exponential เท่านั้น ส่วนการรายงานผลวิจัยให้ใช้ Python หรือ hBayesDM

## ใช้เป็นทีม

1. Deploy โดยตั้ง *Execute as*: **User accessing the web app** และ *Who has access*: **Anyone with Google account**
2. แชร์ Google Sheet ให้ผู้วิจัยในทีมเป็น **Editor** เฉพาะคนที่เกี่ยวข้อง
3. บัญชีที่ไม่ได้รับแชร์จะเปิดแอปได้ แต่อ่านและเขียนข้อมูลไม่ได้
4. แต่ละคนต้องกด Authorize ครั้งแรกเอง

## แก้โค้ดภายหลัง

วางโค้ดใหม่ → Save → **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy** (URL เดิม)

## แก้ปัญหา

| อาการ | วิธีแก้ |
|---|---|
| หาเมนู Apps Script ไม่เจอ | ต้องทำบนคอมพิวเตอร์ |
| Script function not found: doGet | ยังไม่ Save `Code.gs` หรือวางไม่ครบ |
| No HTML file named Index | ไฟล์ต้องชื่อ `Index` ไม่มี .html |
| Sorry, unable to open the file | login Google หลายบัญชี ให้เปิด Incognito แล้ว login บัญชีเดียว |
| ไม่มีสิทธิ์เข้าถึงฐานข้อมูล | บัญชีนั้นยังไม่ได้รับแชร์ Sheet |
| แก้โค้ดแล้วไม่เปลี่ยน | ต้อง Deploy เป็น New version |
| แถบ "มีข้อมูลค้างส่ง" ไม่หาย | เช็กเน็ต แล้วกด "ส่งอีกครั้ง" ถ้าขึ้นข้อความ error ให้ดูว่ากลุ่ม/ครั้งที่ยังอยู่ในชีตตั้งค่าหรือไม่ |

## ข้อควรระวัง

- **PDPA/จริยธรรม**: ใช้รหัสผู้เข้าร่วมเท่านั้น ห้ามใส่ชื่อ, HN หรือเลขบัตรประชาชน และให้สอดคล้องกับที่ระบุใน protocol ที่ EC อนุมัติ
- เวลาตอบ (RT) วัดในเบราว์เซอร์ จึงละเอียดระดับประมาณ 10 ms ใช้ได้กับ DDT แต่ไม่เหมาะกับงานที่ต้องการ RT แม่นยำสูง
- ข้อมูลอยู่ในบัญชี Google ของผู้วิจัย ควรใช้บัญชีของหน่วยงานถ้ามีข้อกำหนด

## ทดสอบ (สำหรับนักพัฒนา)

```bash
node webapp/build.js
node webapp/test/server.test.js   # Code.gs กับ mock ของ SpreadsheetApp/DriveApp/LockService
node webapp/test/e2e.js           # Index.html จริงใน Chromium (iPad + iPhone)
```

ผ่านการทดสอบด้วย mock แล้ว แต่ยังไม่ได้ทดสอบการเขียนลง Google Sheet/Drive จริงในบัญชีผู้ใช้

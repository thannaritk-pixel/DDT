# Delay Discounting Task (DDT) สำหรับ Computational Psychiatry

ชุดเครื่องมือสำหรับเก็บข้อมูลและวิเคราะห์ **delay discounting** (การลดคุณค่าของรางวัลตามเวลาที่ต้องรอ) ประกอบด้วย

1. **`task/`** ตัวงานบนเว็บเบราว์เซอร์ (HTML/JS ล้วน ไม่ต้องติดตั้งอะไร ใช้ออฟไลน์ได้ รองรับมือถือ/แท็บเล็ต) มี 3 รูปแบบตามงานวิจัยต้นแบบ
2. **`analysis/`** โค้ด Python สำหรับ fit computational model ทีละคน (MLE) เปรียบเทียบโมเดล ตรวจคุณภาพข้อมูล และทำ parameter recovery
3. **`analysis/fit_hbayesdm.R`** สคริปต์ hierarchical Bayesian ด้วย hBayesDM

---

## 1. ทำไม delay discounting ถึงสำคัญในจิตเวช

ผู้ที่ลดคุณค่ารางวัลในอนาคตอย่างรวดเร็ว (ค่า *k* สูง) มักเลือกรางวัลเล็กที่ได้ทันทีมากกว่ารางวัลใหญ่ที่ต้องรอ
ภาวะนี้สัมพันธ์กับ addiction (Amlung et al., 2017) และพบได้ข้ามหลายโรค เช่น ADHD, MDD, bipolar, schizophrenia, BPD และ binge-eating
จึงถูกเสนอว่าเป็น **transdiagnostic process** (Amlung et al., 2019; Lempert et al., 2019)
ในกรอบ computational psychiatry เราไม่ได้ดูแค่สัดส่วนการเลือก แต่ประมาณค่าพารามิเตอร์ของ generative model
(*k* = อัตราการลดคุณค่า, *β* = ความสม่ำเสมอของการเลือก) เพื่อใช้เป็น phenotype ที่ตีความเชิงกลไกได้ (Huys et al., 2016)

## 2. รูปแบบของงาน (mode)

| mode | จำนวนข้อ | ต้นแบบ | เหมาะกับ |
|---|---|---|---|
| `kirby` | 27 (+3 catch) | Monetary Choice Questionnaire (Kirby, Petry & Bickel, 1999) | เทียบกับงานวิจัยเดิม/norm, ทำเร็ว (~3 นาที) |
| `grid` | 56 (+3 catch) | 7 delays × 8 อัตราส่วน SS/LL ครอบคลุม k ≈ 10⁻⁴–6 (แนวคิดจาก Kirby & Maraković, 1996) | **fit model** และเปรียบเทียบโมเดล (แนะนำสำหรับ computational work) |
| `adjusting` | 42 (+3 catch) | Adjusting-amount (Du, Green & Myerson, 2002) 7 delays × 6 ขั้น | ได้ indifference point รายช่วงเวลา, AUC, ตรวจ nonsystematic data |

รายละเอียดการออกแบบ
- ตัวเลือก "วันนี้" vs "ในอนาคต" สุ่มซ้าย/ขวาทุกข้อ และสุ่มลำดับด้วย seed ที่บันทึกไว้ (ทำซ้ำได้)
- **Catch trials** 3 ข้อ: เงินวันนี้มากกว่าเงินในอนาคต ถ้าเลือก "อนาคต" แปลว่าไม่ตั้งใจ/ไม่เข้าใจ
- ข้อฝึกหัด 2 ข้อ (ไม่นำไปวิเคราะห์)
- จำนวนเงินเป็น "base units" ของ Kirby (11–85) × `scale` (ค่าเริ่มต้น 10 → 110–850 บาท) ปรับให้เหมาะกับค่าครองชีพของกลุ่มตัวอย่างได้
- บันทึก reaction time ทุกข้อ

## 3. วิธีใช้งานตัว task

เปิด `task/index.html` ในเบราว์เซอร์ (ดับเบิลคลิก หรือโฮสต์บน GitHub Pages) แล้วตั้งค่าในหน้าแรก
หรือส่งค่าผ่าน URL เพื่อข้ามหน้าตั้งค่า

```
task/index.html?id=S001&mode=grid&scale=10&currency=บาท&autostart=1
```

| พารามิเตอร์ | ค่า |
|---|---|
| `id` | รหัสผู้เข้าร่วม |
| `mode` | `kirby`, `grid`, `adjusting` |
| `scale` | ตัวคูณจำนวนเงิน |
| `currency` | หน่วยเงินที่แสดง |
| `practice=0` / `catch=0` | ปิดข้อฝึกหัด / catch trials |
| `seed` | กำหนด seed เอง |
| `autostart=1` | เริ่มทันที |

ผู้เข้าร่วมแตะเลือกบนจอ หรือกด <kbd>F</kbd>/<kbd>J</kbd> (หรือลูกศรซ้าย/ขวา)
เมื่อจบ ระบบดาวน์โหลดไฟล์ `.txt` อัตโนมัติ และมีปุ่มดาวน์โหลด `.csv` (มีข้อฝึกหัดและ catch trials ครบ)
ข้อมูลระหว่างทำจะสำรองใน `localStorage` ด้วย

### ใช้งานบน iPad

Safari บน iPad เปิดไฟล์ HTML ในเครื่องโดยตรงไม่ได้ ต้องเปิดผ่านลิงก์เว็บ วิธีที่ง่ายที่สุดคือ **GitHub Pages** (ฟรี)

1. merge branch นี้เข้า `main`
2. บน GitHub ไปที่ **Settings → Pages** เลือก *Source: Deploy from a branch*, *Branch: `main`*, โฟลเดอร์ `/ (root)` แล้วกด Save
   (repo ต้องเป็น public ถ้าใช้บัญชีฟรี)
3. รอ 1–2 นาที แล้วเปิดใน Safari: `https://<username>.github.io/<repo>/`
   ใส่ค่าทาง URL ได้ เช่น `https://<username>.github.io/<repo>/?id=S001&mode=grid&autostart=1`
4. (แนะนำ) กดปุ่ม **แชร์ → Add to Home Screen** เพื่อเปิดแบบเต็มจอเหมือนแอป
5. (แนะนำ) เปิด **Guided Access** (Settings → Accessibility → Guided Access แล้วกดปุ่ม Home/ปุ่มด้านข้าง 3 ครั้ง)
   เพื่อล็อกไม่ให้ผู้เข้าร่วมออกจากหน้างาน

เมื่อทำเสร็จ ไฟล์ `.txt` จะถูกบันทึกไว้ที่แอป **Files → Downloads** (Safari อาจถามก่อนดาวน์โหลด ให้กด Download)
แล้วส่งออกด้วย AirDrop, อีเมล หรือ Google Drive เมื่อโหลดหน้าเว็บแล้วจะทำงานต่อได้แม้ไม่มีอินเทอร์เน็ต
แต่ห้ามรีเฟรชหน้าระหว่างทำ

ทางเลือกอื่น: บนคอมพิวเตอร์ในวง Wi-Fi เดียวกัน รัน `python3 -m http.server 8000` ในโฟลเดอร์ repo
แล้วเปิด `http://<IP ของคอมพิวเตอร์>:8000/` บน iPad

### รูปแบบข้อมูล

ไฟล์ `.txt` (tab-separated) ใช้ชื่อคอลัมน์เดียวกับ hBayesDM จึงใช้ได้ทันที

| คอลัมน์ | ความหมาย |
|---|---|
| `subjID` | รหัสผู้เข้าร่วม |
| `delay_later`, `amount_later` | ระยะเวลารอ (วัน) และจำนวนเงินของตัวเลือกในอนาคต |
| `delay_sooner`, `amount_sooner` | เหมือนกันสำหรับตัวเลือกวันนี้ (delay = 0) |
| `choice` | **1 = เลือกอนาคต (LL)**, 0 = เลือกวันนี้ (SS) |
| `rt_ms` | reaction time |
| `k_indiff` | ค่า k ที่ทำให้ hyperbolic discounter เฉย ๆ ระหว่างสองตัวเลือก = (LL/SS − 1)/D |
| `is_catch`, `phase`, `block`, `item`, `later_on_left`, `seed`, ... | ข้อมูลประกอบ |

## 4. Computational models

ทุกโมเดลใช้โครงสร้างเดียวกัน

$$V = A \cdot f(D), \qquad P(\text{LL}) = \frac{1}{1 + e^{-\beta (V_{LL} - V_{SS})}}$$

| โมเดล | discount function *f(D)* | พารามิเตอร์ | อ้างอิง |
|---|---|---|---|
| exponential | $e^{-kD}$ | k, β | Samuelson (1937) |
| **hyperbolic** | $1/(1+kD)$ | k, β | Mazur (1987) |
| hyperboloid | $1/(1+kD)^s$ | k, s, β | Green & Myerson (2004) |
| quasi-hyperbolic (β-δ) | 1 ถ้า D = 0, ไม่เช่นนั้น $b\,\delta^D$ | b, δ, β | Laibson (1997) |

โมเดลนี้ตรงกับ `dd_hyperbolic`/`dd_exp` ของ hBayesDM (Ahn, Haines & Zhang, 2017) ค่าจึงเทียบกันได้
(หมายเหตุ: β ขึ้นกับหน่วยเงิน ถ้าต้องการเทียบข้ามสกุลเงินให้ใช้ `--normalize`)

นอกจากนี้มีวิธี model-free แบบดั้งเดิม
- **Kirby consistency method** หา k ที่ทำให้การเลือกสอดคล้องสูงสุด แยกตามขนาดรางวัล S/M/L (Kirby et al., 1999)
- **Area under the curve (AUC)** จาก indifference points (Myerson, Green & Warusawitharana, 2001)
- **Johnson & Bickel (2008) criteria** ตรวจ indifference points ที่ไม่เป็นระบบ

## 5. วิธีวิเคราะห์

```bash
cd analysis
pip install -r requirements.txt

# fit ทุกคน ทุกโมเดล
python -m ddt.fit ../data/*.txt --out results.csv

# ตรวจว่า design กู้ค่าพารามิเตอร์กลับมาได้ (ควรทำก่อนเก็บข้อมูลจริง)
python -m ddt.recovery --design grid --n 200

# test
python -m pytest tests
```

`results.csv` มี 1 แถวต่อ ผู้เข้าร่วม × โมเดล: ค่าพารามิเตอร์, `log_k`, NLL, AIC, BIC, AIC/BIC weights, pseudo-R²,
`at_bound` (ค่าติดขอบ เช่น เลือกอนาคตทุกข้อ) และคะแนนเฉพาะ mode (Kirby k, AUC, indifference points, J&B flags)

Hierarchical Bayesian (แนะนำเมื่อจำนวนข้อน้อยหรือต้องการประมาณค่าระดับกลุ่ม):

```bash
Rscript analysis/fit_hbayesdm.R data/
```

### ผล parameter recovery (simulated hyperbolic agents, n = 100)

| design | r(log k) | r(log β) |
|---|---|---|
| kirby | 0.98 | 0.26 |
| grid | 0.99 | 0.60 |

*k* กู้คืนได้ดีทั้งสอง design แต่ β กู้คืนได้ไม่ดีใน Kirby (ข้อน้อยและไม่มีข้อซ้ำ) ถ้าคำถามวิจัยเกี่ยวกับ choice consistency ควรใช้ `grid`

### ข้อแนะนำการวิเคราะห์

1. **คัดข้อมูลออกก่อน** ตามเกณฑ์ที่ประกาศล่วงหน้า เช่น ตอบผิด catch trial ≥ 2 ข้อ, Kirby consistency < 75%, หรือผิดเกณฑ์ Johnson & Bickel
2. **ใช้ log(k)** ในการวิเคราะห์ทางสถิติ เพราะ k เบ้มาก
3. **เปรียบเทียบโมเดล** ด้วย summed BIC หรือ LOOIC (hBayesDM) ก่อนเลือกโมเดลสำหรับรายงานพารามิเตอร์
4. ทำ **parameter recovery และ model recovery** สำหรับ design ที่ใช้จริง (Wilson & Collins, 2019)
5. รายงานจำนวนคนที่ค่าติดขอบ (`at_bound`) เพราะค่า k ของคนกลุ่มนี้ประมาณได้ไม่แม่น

## 6. โครงสร้างไฟล์

```
task/
  index.html      หน้างาน
  designs.js      ชุดข้อ: Kirby 27, grid, adjusting, catch, practice
  ddt.js          ตัวรันงาน, บันทึก/ดาวน์โหลดข้อมูล
  style.css
analysis/
  ddt/models.py   discount functions + softmax choice rule
  ddt/fitting.py  MLE, AIC/BIC, simulation
  ddt/scoring.py  Kirby k, indifference points, AUC, Johnson & Bickel
  ddt/fit.py      CLI สำหรับ fit ไฟล์ข้อมูล
  ddt/recovery.py parameter recovery
  fit_hbayesdm.R  hierarchical Bayesian ด้วย hBayesDM
  tests/
```

## 7. เอกสารอ้างอิง

- Ahn, W.-Y., Haines, N., & Zhang, L. (2017). Revealing neurocomputational mechanisms of reinforcement learning and decision-making with the hBayesDM package. *Computational Psychiatry, 1*, 24–57. PMID 29601060
- Amlung, M., Vedelago, L., Acker, J., Balodis, I., & MacKillop, J. (2017). Steep delay discounting and addictive behavior: A meta-analysis of continuous associations. *Addiction, 112*(1), 51–62. PMID 27450931
- Amlung, M., Marsden, E., Holshausen, K., et al. (2019). Delay discounting as a transdiagnostic process in psychiatric disorders: A meta-analysis. *JAMA Psychiatry, 76*(11), 1176–1186. PMID 31461131
- Du, W., Green, L., & Myerson, J. (2002). Cross-cultural comparisons of discounting delayed and probabilistic rewards. *The Psychological Record, 52*, 479–492.
- Green, L., & Myerson, J. (2004). A discounting framework for choice with delayed and probabilistic rewards. *Psychological Bulletin, 130*(5), 769–792. PMID 15367080
- Huys, Q. J. M., Maia, T. V., & Frank, M. J. (2016). Computational psychiatry as a bridge from neuroscience to clinical applications. *Nature Neuroscience, 19*(3), 404–413.
- Johnson, M. W., & Bickel, W. K. (2008). An algorithm for identifying nonsystematic delay-discounting data. *Experimental and Clinical Psychopharmacology, 16*(3), 264–274. PMID 18540786
- Kirby, K. N., & Maraković, N. N. (1996). Delay-discounting probabilistic rewards: Rates decrease as amounts increase. *Psychonomic Bulletin & Review, 3*(1), 100–104. PMID 24214810
- Kirby, K. N., Petry, N. M., & Bickel, W. K. (1999). Heroin addicts have higher discount rates for delayed rewards than non-drug-using controls. *Journal of Experimental Psychology: General, 128*(1), 78–87. PMID 10100392
- Laibson, D. (1997). Golden eggs and hyperbolic discounting. *Quarterly Journal of Economics, 112*(2), 443–477.
- Lempert, K. M., Steinglass, J. E., Pinto, A., Kable, J. W., & Simpson, H. B. (2019). Can delay discounting deliver on the promise of RDoC? *Psychological Medicine, 49*(2), 190–199.
- Mazur, J. E. (1987). An adjusting procedure for studying delayed reinforcement. In M. L. Commons et al. (Eds.), *Quantitative Analyses of Behavior, Vol. 5* (pp. 55–73). Erlbaum.
- Myerson, J., Green, L., & Warusawitharana, M. (2001). Area under the curve as a measure of discounting. *Journal of the Experimental Analysis of Behavior, 76*(2), 235–243. PMID 11599641
- Samuelson, P. A. (1937). A note on measurement of utility. *Review of Economic Studies, 4*(2), 155–161.
- Wilson, R. C., & Collins, A. G. E. (2019). Ten simple rules for the computational modeling of behavioral data. *eLife, 8*, e49547. PMID 31769410

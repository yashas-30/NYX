# 21st.dev Web Builder v2 — Claude Code Skill

> A Claude Code skill that transforms how you build websites using [21st.dev](https://21st.dev) components — the largest marketplace of shadcn/ui-based React Tailwind components with 1400+ components.

---

## Table of Contents / สารบัญ

- [English](#english)
  - [What is this?](#what-is-this)
  - [Installation](#installation)
  - [Usage](#usage)
  - [What the Skill Does](#what-the-skill-does)
  - [Development Story](#development-story)
  - [Key Insights from Testing](#key-insights-from-testing)
  - [File Structure](#file-structure)
- [ภาษาไทย](#ภาษาไทย)
  - [นี่คืออะไร?](#นี่คืออะไร)
  - [วิธีติดตั้ง](#วิธีติดตั้ง)
  - [วิธีใช้งาน](#วิธีใช้งาน)
  - [สกิลนี้ทำอะไรได้บ้าง](#สกิลนี้ทำอะไรได้บ้าง)
  - [เรื่องราวการพัฒนา](#เรื่องราวการพัฒนา)
  - [บทเรียนสำคัญจากการทดสอบ](#บทเรียนสำคัญจากการทดสอบ)
  - [โครงสร้างไฟล์](#โครงสร้างไฟล์)

---

# English

## What is this?

This is a **Claude Code Skill** — a set of instructions that teaches Claude how to build production-ready websites using components from [21st.dev](https://21st.dev). Think of it as giving Claude a specialized "playbook" for discovering, selecting, installing, and composing 21st.dev components into cohesive web applications.

**Without this skill**, Claude can still build websites, but it won't know about 21st.dev's component registry, how to search it, which components work well together, or how to fix common integration issues.

**With this skill**, Claude becomes an expert at:
- Browsing 21st.dev's 1400+ component catalog in real-time
- Selecting the right components for each section of your site
- Installing components via `npx shadcn@latest add`
- Fixing common post-install compatibility issues
- Maintaining visual coherence across components from different authors
- Avoiding AI design clichés (purple color bias, Sparkles icons)

## Installation

### Method 1: Copy the skill folder

Copy the `21st-dev-builder-v2` folder into your Claude Code skills directory:

```bash
# Clone this repo
git clone https://github.com/trin-zenityx/21st-dev-builder-v2.git

# Copy to your Claude skills directory
cp -r 21st-dev-builder-v2 ~/.claude/skills/21st-dev-builder-v2
```

### Method 2: Install the .skill file

If you have the `.skill` file, you can install it directly in Claude Code.

### Verify installation

Start a new Claude Code session and say something like:

> "Build me a landing page using 21st.dev components"

Claude should automatically activate this skill and follow its workflow.

## Usage

Just tell Claude what you want to build and mention **21st.dev** or **21st**. Examples:

```
"Build a SaaS landing page using 21st.dev with hero, pricing, and testimonials"

"ใช้ 21st สร้าง dashboard สำหรับ analytics app"

"Find the best hero components on 21st.dev for a fintech landing page"

"Add a pricing section from 21st to my existing Next.js app"

"Help me set up the 21st.dev MCP server"
```

The skill triggers when you mention "21st.dev", "21st", "ใช้ 21st", "21st component", etc. It will **not** trigger for general web development requests that don't reference 21st.dev.

## What the Skill Does

The skill guides Claude through an 8-phase workflow:

| Phase | What happens |
|-------|-------------|
| **1. Project Setup** | Checks for Next.js + Tailwind + shadcn, creates project if needed |
| **2. Requirement Analysis** | Breaks down your request into a component plan using the Component Map |
| **3. Live Discovery** | Browses 21st.dev categories to find the latest components (never relies on memory alone) |
| **4. Analysis & Selection** | Evaluates candidates on functional fit, visual quality, design coherence, and popularity |
| **4.5. Build vs Install** | Decides which sections need 21st.dev components vs custom code |
| **5. Installation** | Installs components and applies 8 post-install compatibility fixes |
| **6. Page Composition** | Assembles components with consistent layout, spacing, and theming |
| **7. Customization** | Applies brand colors (industry-specific), typography, and animations |
| **8. Verification** | Builds, visually inspects, tests responsiveness, and checks interactions |

### Key features:

- **Industry-specific color selection** — A lookup table maps product types to recommended primary colors, preventing the AI purple bias
- **Post-install compatibility fixes** — 8 documented fixes for common issues (render prop conflicts, invisible cards, broken gradients, z-index traps)
- **Hero visual quality checklist** — Ensures hero sections look professional, not AI-generated
- **Anti-AI design rules** — Never uses Sparkles/Stars/Wand icons, never defaults to purple

## Development Story

This skill was developed through an iterative, test-driven process using Claude Code's skill-creator framework. Here's how it evolved:

### Iteration 1: Initial Draft (Simulated Testing)

The first version covered the basics: project setup, component discovery via WebFetch/WebSearch, installation via npx, and page composition patterns. We ran 3 test prompts (SaaS landing page, admin dashboard, developer portfolio) in simulated mode to validate the workflow structure.

### Iteration 2: Real-World Testing

We ran the same 3 test prompts as **real builds** — Claude actually created Next.js projects, browsed 21st.dev, installed components, and built complete websites.

**Results:**
- **With skill**: 100% pass rate (3/3 tests passed all assertions)
- **Without skill (baseline)**: 75% pass rate

The skill clearly helped Claude produce better results, but visual inspection revealed several issues that automated assertions didn't catch.

### Iteration 3: Visual Quality Fixes

After viewing the actual built websites in Chrome (the preview tool had rendering limitations), we found and fixed several issues:

1. **Testimonial cards invisible** — Cards used `from-muted/50 to-muted/10` gradient which was nearly invisible on white backgrounds. Combined with `w-1/3` edge fades on the marquee, cards were completely hidden. Fixed with solid `bg-card border border-border/60 shadow-sm` styling and reduced edge fades to `w-1/6`.

2. **Announcement badge at gradient edge** — The announcement banner was positioned outside the hero section, sitting right at the transition from white to purple gradient. Looked awkward. Fixed by moving the banner inside the hero component as a prop.

3. **Hero section headings too faint** — Gradient text effects (`bg-clip-text text-transparent`) were unreadable on colored backgrounds. Fixed by recommending solid `text-foreground` for hero headings.

### Iteration 4: Anti-AI Design Rules

The most impactful iteration came from user feedback about AI design fingerprints:

1. **Sparkles icon = AI fingerprint** — The user pointed out that Sparkles/Stars icons are the #1 visual cliché of AI-generated content. Every AI product uses them. We replaced the announcement badge's Sparkles icon with a minimal pulsing dot indicator, and added a rule to never use these icons.

2. **Purple color bias** — The user asked "Why does AI always use purple?" and challenged us to determine if it's a real bias or random chance. Investigation confirmed it IS a real bias — purple dominates tech/AI branding (Figma, Notion AI, Copilot), and AI models trained on this data default to purple. We added an industry-specific Color Selection table with 10 product categories mapped to recommended primary colors, and the rule "NEVER default to purple."

### Iteration 5: Description Optimization

Created 20 trigger evaluation queries (10 should-trigger, 10 should-not-trigger) to optimize when the skill activates. The queries test edge cases like:
- Thai language queries with "21st" mention (should trigger)
- MCP server setup requests (should trigger)
- General shadcn/ui requests without 21st mention (should NOT trigger)
- React Native / API / deployment requests (should NOT trigger)

### Final Skill: 551 Lines

The final SKILL.md weighs in at 551 lines covering:
- 8-phase workflow
- Component Map for 10 application types
- Category slugs reference for 50+ component categories
- 7 selection criteria with decision framework
- 8 post-install compatibility fixes
- Industry-specific color selection table
- Hero visual quality checklist with anti-AI rules
- 15 error recovery patterns
- MCP setup instructions

## Key Insights from Testing

These are the most valuable lessons learned during development:

### 1. Invisible Components are Common
Many 21st.dev components use extremely subtle styling that works on the component demo page but becomes invisible when composed into a full page. Subtle gradients, thin borders, and transparency effects compound with parent backgrounds to create ghost elements. **Always verify components are actually visible after installation.**

### 2. AI Has Predictable Design Fingerprints
AI-generated websites have tell-tale signs: Sparkles/Stars icons, purple/violet as the default color, overly symmetrical layouts, and generic placeholder text. A good skill should actively counteract these tendencies to produce output that looks professional and human-crafted.

### 3. Edge Fades Destroy Marquee Content
Marquee/carousel components often have gradient edge fades (`w-1/3`) that cover 2/3 of the content area. This is the #1 reason testimonial cards appear blank.

### 4. oklch() Breaks in Gradients
Tailwind CSS v4 uses `oklch()` color values, but `oklch()` renders poorly in CSS `radial-gradient()` and some other gradient contexts. Always use `rgba()` or hex values for custom gradients.

### 5. Z-Index Traps with Background Decorations
A common pattern is placing decorative gradient divs with `-z-10` behind content. But if the parent has `bg-background` (opaque), the gradient is invisible. Apply gradients directly on the section element instead.

### 6. Build vs Install is Critical
Not every section needs a 21st.dev component. Simple sections (feature grid, stats row, basic CTA) are often better written custom. A typical landing page installs 2-3 complex components (hero, navbar, footer) and writes 2-3 simple sections custom. Forcing everything through 21st.dev creates visual inconsistency.

## File Structure

```
21st-dev-builder-v2/
├── SKILL.md                           # Main skill file (551 lines)
├── README.md                          # This file
├── trigger-eval.json                  # 20 trigger evaluation queries
├── evals/
│   └── evals.json                     # 3 test prompts for functional evaluation
└── references/
    └── component-catalog.md           # Full 21st.dev component catalog (96 entries)
```

---

# ภาษาไทย

## นี่คืออะไร?

นี่คือ **Claude Code Skill** — ชุดคำสั่งที่สอนให้ Claude สร้างเว็บไซต์โดยใช้ components จาก [21st.dev](https://21st.dev) ซึ่งเป็นตลาด component React/Tailwind ที่ใหญ่ที่สุด มี component มากกว่า 1400+ ตัว สร้างบน shadcn/ui

เปรียบเทียบง่ายๆ คือเหมือนให้ "คู่มือผู้เชี่ยวชาญ" แก่ Claude สำหรับการค้นหา เลือก ติดตั้ง และประกอบ components จาก 21st.dev ให้เป็นเว็บแอปพลิเคชันที่สมบูรณ์

**ไม่มี skill นี้** — Claude ก็สร้างเว็บได้ แต่จะไม่รู้จัก 21st.dev ไม่รู้วิธีค้นหา component ไม่รู้ว่า component ไหนเข้ากันได้ดี และไม่รู้วิธีแก้ปัญหาที่เกิดขึ้นบ่อยหลังติดตั้ง

**มี skill นี้** — Claude จะเชี่ยวชาญเรื่อง:
- ค้นหา component จาก catalog 1400+ ตัวของ 21st.dev แบบ real-time
- เลือก component ที่เหมาะสมสำหรับแต่ละส่วนของเว็บ
- ติดตั้ง component ผ่าน `npx shadcn@latest add`
- แก้ปัญหา compatibility ที่พบบ่อยหลังติดตั้ง
- รักษาความสอดคล้องด้านการออกแบบข้าม component จากผู้สร้างต่างกัน
- หลีกเลี่ยง "ลายเซ็น AI" ในการออกแบบ (เช่น ใช้สีม่วงเป็นค่าเริ่มต้น, ใช้ไอคอน Sparkles)

## วิธีติดตั้ง

### วิธีที่ 1: คัดลอกโฟลเดอร์ skill

```bash
# Clone repo นี้
git clone https://github.com/trin-zenityx/21st-dev-builder-v2.git

# คัดลอกไปยัง Claude skills directory
cp -r 21st-dev-builder-v2 ~/.claude/skills/21st-dev-builder-v2
```

### วิธีที่ 2: ติดตั้งจากไฟล์ .skill

ถ้ามีไฟล์ `.skill` สามารถติดตั้งตรงใน Claude Code ได้เลย

### ตรวจสอบการติดตั้ง

เปิด Claude Code session ใหม่แล้วพิมพ์:

> "ใช้ 21st สร้าง landing page ให้หน่อย"

Claude ควรจะเปิดใช้ skill นี้โดยอัตโนมัติและทำตาม workflow

## วิธีใช้งาน

บอก Claude ว่าอยากสร้างอะไร แล้วอ้างถึง **21st.dev** หรือ **21st** ตัวอย่าง:

```
"ใช้ 21st สร้าง landing page สำหรับ SaaS product มี hero, pricing, testimonials"

"สร้าง dashboard ด้วย 21st component มี sidebar, stat cards, data table"

"อยากได้ sign-in page สวยๆ จาก 21st.dev"

"Browse hero section บน 21st.dev ให้ดูหน่อย อยากได้แบบ fintech"

"ช่วย set up 21st.dev MCP server ให้หน่อย"
```

Skill จะทำงานเมื่อคุณพูดถึง "21st.dev", "21st", "ใช้ 21st", "จาก 21st" ฯลฯ แต่จะ **ไม่ทำงาน** สำหรับการสร้างเว็บทั่วไปที่ไม่ได้อ้างถึง 21st.dev

## สกิลนี้ทำอะไรได้บ้าง

Skill นำ Claude ผ่าน workflow 8 ขั้นตอน:

| ขั้นตอน | รายละเอียด |
|---------|-----------|
| **1. ตั้งค่าโปรเจค** | ตรวจสอบ Next.js + Tailwind + shadcn สร้างโปรเจคใหม่ถ้าจำเป็น |
| **2. วิเคราะห์ความต้องการ** | แบ่งคำขอออกเป็นแผน component โดยใช้ Component Map |
| **3. ค้นหา Component แบบ Live** | ค้นหาจาก 21st.dev โดยตรง (ไม่พึ่งความจำ เพราะมี component ใหม่ทุกวัน) |
| **4. วิเคราะห์และเลือก** | ประเมินตัวเลือกจาก functional fit, คุณภาพ visual, ความสอดคล้องของ design |
| **4.5. สร้างเอง vs ติดตั้ง** | ตัดสินใจว่าส่วนไหนควรใช้ 21st.dev component vs เขียนเอง |
| **5. ติดตั้ง** | ติดตั้ง component และใช้ 8 วิธีแก้ปัญหา compatibility |
| **6. ประกอบหน้า** | ประกอบ component ด้วย layout, spacing, theming ที่สอดคล้องกัน |
| **7. ปรับแต่ง** | ใส่สีแบรนด์ (ตามอุตสาหกรรม), typography, animations |
| **8. ตรวจสอบ** | Build, ตรวจ visual, ทดสอบ responsive, ตรวจ interactions |

### ฟีเจอร์เด่น:

- **เลือกสีตามอุตสาหกรรม** — ตารางแนะนำสีหลักตามประเภทธุรกิจ ป้องกัน AI ใช้สีม่วงเป็นค่าเริ่มต้น
- **แก้ปัญหาหลังติดตั้ง 8 รูปแบบ** — ครอบคลุมปัญหาที่พบบ่อย (render prop conflicts, card มองไม่เห็น, gradient พัง, z-index trap)
- **Checklist คุณภาพ Hero** — ทำให้ hero section ดูโปรเฟสชันนัล ไม่ใช่ AI สร้าง
- **กฎต่อต้านลายเซ็น AI** — ไม่ใช้ไอคอน Sparkles/Stars/Wand, ไม่ใช้สีม่วงเป็นค่าเริ่มต้น

## เรื่องราวการพัฒนา

Skill นี้ถูกพัฒนาผ่านกระบวนการ iterative, test-driven โดยใช้ framework skill-creator ของ Claude Code นี่คือขั้นตอนที่ skill วิวัฒนาการ:

### รอบที่ 1: ร่างแรก (ทดสอบจำลอง)

เวอร์ชันแรกครอบคลุมพื้นฐาน: ตั้งค่าโปรเจค, ค้นหา component ผ่าน WebFetch/WebSearch, ติดตั้งผ่าน npx, และรูปแบบการประกอบหน้า เรารันคำสั่งทดสอบ 3 ชุด (SaaS landing page, admin dashboard, developer portfolio) ในโหมดจำลองเพื่อตรวจสอบโครงสร้าง workflow

### รอบที่ 2: ทดสอบจริง

เรารันคำสั่งทดสอบ 3 ชุดเดิมเป็น **real builds** — Claude สร้างโปรเจค Next.js จริง, ค้นหาจาก 21st.dev จริง, ติดตั้ง component จริง, และสร้างเว็บไซต์สมบูรณ์

**ผลลัพธ์:**
- **มี skill**: ผ่าน 100% (3/3 tests ผ่านทุก assertion)
- **ไม่มี skill (baseline)**: ผ่าน 75%

Skill ช่วยให้ Claude สร้างผลลัพธ์ที่ดีขึ้นอย่างชัดเจน แต่การตรวจสอบด้วยตาพบปัญหาหลายอย่างที่ automated assertions ตรวจไม่เจอ

### รอบที่ 3: แก้ปัญหาคุณภาพ Visual

หลังจากดูเว็บไซต์จริงใน Chrome (เครื่องมือ preview มีข้อจำกัดในการ render) เราพบและแก้ไขปัญหาหลายอย่าง:

1. **Testimonial cards มองไม่เห็น** — Cards ใช้ gradient `from-muted/50 to-muted/10` ที่แทบมองไม่เห็นบนพื้นหลังสีขาว รวมกับ edge fades `w-1/3` ของ marquee ทำให้ cards หายไปหมด แก้ด้วย `bg-card border border-border/60 shadow-sm` และลด edge fades เหลือ `w-1/6`

2. **ป้าย Announcement อยู่ที่ขอบ gradient** — Banner ประกาศอยู่นอก hero section ตรงรอยต่อระหว่างสีขาวกับ gradient สีม่วง ดูไม่ลงตัว แก้โดยย้าย banner เข้าไปใน hero component เป็น prop

3. **หัวข้อ Hero จางเกินไป** — Gradient text effects (`bg-clip-text text-transparent`) อ่านไม่ออกบนพื้นหลังสี แก้โดยแนะนำให้ใช้ `text-foreground` แบบทึบ

### รอบที่ 4: กฎต่อต้านลายเซ็น AI

รอบที่มีผลกระทบมากที่สุดมาจาก feedback ของผู้ใช้เกี่ยวกับ "ลายเซ็น AI" ในการออกแบบ:

1. **ไอคอน Sparkles = ลายเซ็น AI** — ผู้ใช้ชี้ให้เห็นว่าไอคอน Sparkles/Stars คือสิ่งที่ "บ่งบอกได้ชัดเจนว่า AI เป็นคนสร้าง" เพราะ AI product แทบทุกตัวใช้ เราเปลี่ยนไอคอน Sparkles เป็นจุดกระพริบ (pulsing dot) แบบ minimal และเพิ่มกฎห้ามใช้ไอคอนเหล่านี้

2. **AI ชอบใช้สีม่วง (Purple Bias)** — ผู้ใช้ถามว่า "ทำไม AI ชอบใช้สีม่วง?" และท้าทายให้ตรวจสอบว่าเป็น bias จริงหรือแค่สุ่ม การสืบสวนยืนยันว่า **เป็น bias จริง** — สีม่วงครอบงำ branding ของบริษัทเทคโนโลยี/AI (Figma, Notion AI, Copilot) และ AI models ที่เทรนกับข้อมูลเหล่านี้จึง default เป็นสีม่วง เราเพิ่มตาราง Color Selection ตามอุตสาหกรรม 10 ประเภท พร้อมกฎ "ห้าม default เป็นสีม่วง"

### รอบที่ 5: ปรับ Description ให้แม่นยำ

สร้าง trigger evaluation queries 20 ชุด (10 ชุดที่ควร trigger, 10 ชุดที่ไม่ควร trigger) เพื่อปรับให้ skill ทำงานได้แม่นยำ ตัวอย่าง edge cases:
- คำขอภาษาไทยที่พูดถึง "21st" (ควร trigger)
- คำขอตั้งค่า MCP server (ควร trigger)
- คำขอ shadcn/ui ทั่วไปที่ไม่ได้พูดถึง 21st (ไม่ควร trigger)
- คำขอ React Native / API / deployment (ไม่ควร trigger)

### Skill สุดท้าย: 551 บรรทัด

SKILL.md ฉบับสุดท้ายมี 551 บรรทัด ครอบคลุม:
- Workflow 8 ขั้นตอน
- Component Map สำหรับ 10 ประเภทแอปพลิเคชัน
- Category slugs reference สำหรับ 50+ หมวดหมู่ component
- เกณฑ์การเลือก 7 ข้อพร้อม decision framework
- วิธีแก้ปัญหาหลังติดตั้ง 8 รูปแบบ
- ตารางเลือกสีตามอุตสาหกรรม
- Checklist คุณภาพ Hero พร้อมกฎต่อต้าน AI
- รูปแบบแก้ปัญหา 15 รายการ
- คำแนะนำตั้งค่า MCP

## บทเรียนสำคัญจากการทดสอบ

นี่คือบทเรียนที่มีค่าที่สุดที่เรียนรู้ระหว่างการพัฒนา:

### 1. Component ที่มองไม่เห็นเป็นเรื่องปกติ
Component จาก 21st.dev หลายตัวใช้ styling ที่ subtle มาก ซึ่งทำงานได้ดีในหน้า demo แต่กลายเป็นมองไม่เห็นเมื่อประกอบในหน้าเต็ม gradient ที่จาง, border ที่บาง, และ transparency effects รวมกับ background ของ parent ทำให้เกิด "ghost elements" **ต้องตรวจสอบเสมอว่า component มองเห็นได้จริงหลังติดตั้ง**

### 2. AI มีลายเซ็นการออกแบบที่คาดเดาได้
เว็บไซต์ที่ AI สร้างมีสัญญาณบอกชัดเจน: ไอคอน Sparkles/Stars, สีม่วงเป็นค่าเริ่มต้น, layout ที่สมมาตรเกินไป, และ placeholder text ที่ generic Skill ที่ดีควรต่อต้านแนวโน้มเหล่านี้อย่างจริงจัง เพื่อให้ผลลัพธ์ดูเป็นมืออาชีพเหมือนมนุษย์ออกแบบ

### 3. Edge Fades ทำลายเนื้อหา Marquee
Component แบบ marquee/carousel มักมี gradient edge fades (`w-1/3`) ที่ปิดพื้นที่เนื้อหา 2/3 นี่คือสาเหตุ #1 ที่ testimonial cards ดูว่างเปล่า

### 4. oklch() พังใน Gradients
Tailwind CSS v4 ใช้ค่าสี `oklch()` แต่ `oklch()` render ไม่ดีใน CSS `radial-gradient()` ควรใช้ `rgba()` หรือค่า hex สำหรับ custom gradients เสมอ

### 5. Z-Index Trap กับ Background ตกแต่ง
Pattern ที่พบบ่อยคือวาง gradient div ตกแต่งด้วย `-z-10` ไว้หลังเนื้อหา แต่ถ้า parent มี `bg-background` (ทึบ) gradient จะมองไม่เห็น ควรใส่ gradient ตรงที่ section element แทน

### 6. Build vs Install สำคัญมาก
ไม่ใช่ทุกส่วนต้องใช้ 21st.dev component ส่วนที่ง่าย (feature grid, stats row, basic CTA) มักเขียนเองดีกว่า Landing page ทั่วไปติดตั้ง 2-3 component ที่ซับซ้อน (hero, navbar, footer) และเขียน 2-3 ส่วนง่ายๆ เอง การบังคับทุกอย่างผ่าน 21st.dev สร้างความไม่สอดคล้องทาง visual

## โครงสร้างไฟล์

```
21st-dev-builder-v2/
├── SKILL.md                           # ไฟล์ skill หลัก (551 บรรทัด)
├── README.md                          # ไฟล์นี้
├── trigger-eval.json                  # 20 trigger evaluation queries
├── evals/
│   └── evals.json                     # 3 test prompts สำหรับ functional evaluation
└── references/
    └── component-catalog.md           # Full 21st.dev component catalog (96 entries)
```

---

## License

MIT

## Credits

Built with [Claude Code](https://claude.ai/claude-code) using the skill-creator framework.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

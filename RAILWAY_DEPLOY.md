# Backend — Railway deploy (tayyorlik va qadamlar)

## 1. Lokal tekshiruv

```powershell
cd mali-platform\backend
npm install
npm run build
```

- Build xatosiz tugashi kerak (`dist/` papkada `.js` fayllar paydo bo‘ladi).
- Xato bo‘lsa: `npx tsc --noEmit` bilan xatolarni ko‘ring.

---

## 2. Bazadagi migration’larni ishlatish

Deploy **oldin** yoki deploy **dan keyin** production DB da quyidagi SQL ni ishga tushiring.

**Fayl:** `mali-platform/backend/migrations/ALL_RECENT_MIGRATIONS.sql`

- Supabase: **SQL Editor** → fayl tarkibini nusxalab yopishtiring → Run.
- Yoki: `psql $DATABASE_URL -f migrations/ALL_RECENT_MIGRATIONS.sql`

Qo‘shiladigan o‘zgarishlar:
- `specialist_notes`: `client_id` nullable, `note_type` ustuni.
- `student_mentor_subscriptions`: 30 kunlik obuna jadvali.

---

## 3. Git orqali Railway ga yuborish

Agar backend alohida repo bo‘lsa:

```powershell
cd mali-platform\backend
git add .
git status
git commit -m "Backend: obuna, specialist_notes, qo'l ko'tarish, balance_updated"
git push origin main
```

Agar loyiha bitta repo bo‘lib, Railway **backend** papkani root qilib deploy qilsa:

- Railway da **Root Directory** ni `backend` (yoki `mali-platform/backend`) qiling.
- Keyin:

```powershell
cd mali-platform
git add .
git commit -m "Backend: obuna, specialist_notes, qo'l ko'tarish"
git push origin main
```

Railway GitHub ulangan bo‘lsa, push dan keyin avtomatik rebuild bo‘ladi.

---

## 4. Railway sozlamalari (Variables)

Dashboard → Backend service → **Variables** da quyidagilar bo‘lishi kerak:

| O‘zgaruvchi       | Tavsif |
|-------------------|--------|
| `PORT`            | `4000` (yoki Railway bergan port) |
| `DATABASE_URL`    | PostgreSQL (Supabase) connection string |
| `JWT_SECRET`      | Uzun maxfiy satr |
| `REDIS_URL`       | Ixtiyoriy; cache uchun |
| `LIVEKIT_API_KEY` | LiveKit uchun |
| `LIVEKIT_API_SECRET` | LiveKit uchun |
| `LIVEKIT_URL`     | LiveKit server URL |

---

## 5. Build va start (Railway)

Railway odatda Node loyihasini avtomatik aniqlaydi.

- **Build Command:** `npm run build` (yoki `npm install && npm run build`)
- **Start Command:** `npm start` (yoki `node dist/index.js`)
- **Root Directory:** agar repo ichida `backend` papka bo‘lsa → `backend`

---

## 6. Deploy dan keyin tekshirish

1. **Health:** `https://YOUR-APP.up.railway.app/` yoki `/api/health` (agar bor bo‘lsa).
2. **API:** `GET https://YOUR-APP.up.railway.app/api/wallet/settings` (platform sozlamalari).
3. **WebSocket:** Frontend da `NEXT_PUBLIC_WS_URL` ni yangi backend URL ga ulang (masalan `wss://...railway.app`).

---

## Qisqacha buyruqlar (PowerShell)

```powershell
cd c:\Users\hp\Desktop\mali-platform\mali-platform\backend
npm run build
# Keyin git push (yuqoridagi buyruqlardan birini ishlating)
```

Migration’lar fayli: **`mali-platform/backend/migrations/ALL_RECENT_MIGRATIONS.sql`**

# MessenjrAli Backend Deploy Qo'llanmasi

Ushbu qo'llanma yordamida backend serverni internetga (Public) chiqaramiz.

## 1. Supabase (PostgreSQL) Sozlash
1. [supabase.com](https://supabase.com/) saytida yangi proyekt yarating.
2. **Project Settings** -> **Database** bo'limiga kiring.
3. **Connection string** qismidan **URI** ni ko'chirib oling (Parolingizni esda saqlang).
   - Manzil bunday ko'rinishda bo'ladi: `postgres://postgres.[USER]:[PASSWORD]@...supabase.co:5432/postgres`

## 2. MongoDB Atlas Sozlash
1. [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas) saytida tekin (Shared) klaster yarating.
2. **Database Access** bo'limida foydalanuvchi (user) va parol yarating.
3. **Network Access** bo'limida `0.0.0.0/0` (hamma joydan ulanish) ni qo'shing.
4. **Connectivity** -> **Connect your application** bo'limidan URI ni ko'chirib oling.
   - Manzil: `mongodb+srv://[USER]:[PASSWORD]@cluster...mongodb.net/?retryWrites=true&w=majority`

## 3. GitHub va Railway Deploy
1. Backend kodini (mali-platform/backend) alohida repository qilib GitHub'ga yuklang.
2. [railway.app](https://railway.app/) saytida yangi proyekt yarating va GitHub repo-ni ulang.
3. **Variables** bo'limiga quyidagilarni qo'shing:
   - `DATABASE_URL`: Supabase'dan olingan URI.
   - `MONGODB_URI`: MongoDB Atlas'dan olingan URI.
   - `JWT_SECRET`: Biror ixtiyoriy uzun tekst (masalan: `MessenjrAli_Secret_2025`).
   - `PORT`: 4000

## 4. Android Ilovani Yangilash
Railway sizga bergan URL'ni (masalan: `https://...railway.app`) olganingizdan so'ng menga yuboring. Men:
1. `RetrofitClient.kt` dagi `BASE_URL` ni yangilayman.
2. `SocketManager.kt` dagi `SOCKET_URL` ni yangilayman.
3. Yangi APK build qilib beraman.
推

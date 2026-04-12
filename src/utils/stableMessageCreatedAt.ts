/**
 * DB da `created_at` NULL bo‘lganda JSON uchun vaqt — **refresh vaqti emas**,
 * xabar `id` dan hisoblangan barqaror ISO (har refreshda bir xil).
 *
 * **2020-01-01 ishlatilmasin** — UI da "2020 yanvar" sarlavhasi chiqadi va haqiqiy 2026
 * xabarlar bilan aralashib tartib sakraydi. Bitta kun (UTC) ichida ofset saqlanadi.
 * Haqiqiy vaqt uchun: `UPDATE messages SET created_at = ... WHERE created_at IS NULL`.
 */
const SYNTHETIC_DAY_ANCHOR_UTC_MS = Date.UTC(2026, 3, 12); // 2026-04-12 — real chat bilan bir yil/oy zonasi

export function stableIsoWhenCreatedAtNull(messageId: string, index: number): string {
    const hex = String(messageId).replace(/-/g, '');
    let n = 0;
    for (let i = 0; i < Math.min(hex.length, 16); i++) {
        const v = parseInt(hex[i]!, 16);
        if (!Number.isNaN(v)) n = (n * 16 + v) >>> 0;
    }
    return new Date(SYNTHETIC_DAY_ANCHOR_UTC_MS + (n % 86_400_000) + index).toISOString();
}

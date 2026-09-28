import { supabaseAdmin } from '@/lib/supabase-admin';
import { imageMime } from '@/lib/teaching-images';

// Only download storage objects referenced by the student's authorized history.
// Never fetch a URL supplied in the request body (SSRF / cross-student access).
export async function loadFollowupImages(raw: unknown, studentId: string) {
  if (!Array.isArray(raw) || !raw.length) return [] as string[];
  if (raw.length > 5) throw new Error('原題圖片數量異常。');
  const entries = raw.map((entry, index) => {
    if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith(`${studentId}/`) || entry.path.includes('..')) throw new Error('原題圖片路徑無效。');
    return { path: entry.path, order: typeof entry.order === 'number' ? entry.order : index };
  }).sort((a, b) => a.order - b.order);
  let total = 0;
  const images: string[] = [];
  for (const entry of entries) {
    const { data, error } = await supabaseAdmin.storage.from('solve-images').download(entry.path);
    if (error || !data) throw new Error('原題圖片暫時讀取失敗，請稍後再試；本次未扣追問次數。');
    total += data.size;
    if (data.size > 8 * 1024 * 1024 || total > 20 * 1024 * 1024) throw new Error('原題圖片容量過大。');
    const buffer = Buffer.from(await data.arrayBuffer());
    const mime = imageMime(buffer);
    if (!mime) throw new Error('原題圖片格式無法辨識。');
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }
  return images;
}

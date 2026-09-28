export type LanguageCategory = 'profanity' | 'insult' | 'threat';
export type LanguageVerdict = { category: LanguageCategory; reason: string; source: 'rules' | 'semantic' } | null;

export function normalizeLanguage(text: string) {
  return text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

// Only standalone, unambiguous profanity is decided without context.
// Substrings such as 操作、乾燥、幹細胞 must never trigger this rule.
export function inspectStandaloneProfanity(text: string): LanguageVerdict {
  const clean = normalizeLanguage(text).replace(/[\s!！?？。.,，~～、]/g, '');
  return /^(操|肏|幹|干你娘|幹你娘|操你媽|肏你媽|幹你媽|他媽的|他妈的|fuck|fucking|shit|wtf|ㄍㄋㄋ|ㄊㄇㄉ)+$/i.test(clean)
    ? { category: /[你妳]/.test(clean) ? 'insult' : 'profanity', reason: /[你妳]/.test(clean) ? '直接使用針對對象的辱罵用語' : '單獨使用明確粗俗用語', source: 'rules' } : null;
}

export function parseLanguageVerdict(raw: string): LanguageVerdict {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(clean);
  if (value?.violation !== true || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0.95 || value.confidence > 1) return null;
  if (!['profanity', 'insult', 'threat'].includes(value.category)) return null;
  return { category: value.category, reason: String(value.reason || '不適當用語').slice(0, 160), source: 'semantic' };
}

export function languageWarning(count: number, blockedUntil: string | null, severe = false) {
  if (blockedUntil) return '今天已多次使用不適當用語，追問暫停 5 分鐘。你仍可閱讀詳解與紀錄；這次不扣追問次數。';
  if (severe) return '偵測到針對人的威脅或嚴重辱罵，這則訊息未送出，已列入教師待查看。請修改後再送出，不扣追問次數。';
  if (count >= 2) return '再次提醒：請修改不適當用語後再送出。今天再發生一次將暫停追問 5 分鐘；這次不扣追問次數。';
  return '偵測到可能不適當的用語，請修改後再送出。這次不扣追問次數。';
}

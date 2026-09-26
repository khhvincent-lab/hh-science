import data from '@/content/chemistry-articles.json';
export const chemistryArticles = [...data].sort((a,b) => b.sourceDate.localeCompare(a.sourceDate));
export type ChemistryArticle = (typeof chemistryArticles)[number];

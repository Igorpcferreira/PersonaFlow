import { z } from 'zod';
import { DEMO_REELS } from '../../shared/demo-data';

export const LOCAL_RECIPE_CAPABILITIES = { publicReply: true, button: false, follow: false };
export const recipeConfig = z.object({ terms: z.array(z.string().trim().min(1).max(80)).max(20), introduction: z.string().max(2000),
  publicReplyEnabled: z.boolean(), publicReply: z.string().max(1500), buttonEnabled: z.boolean(), buttonTitle: z.string().max(80),
  followRequired: z.boolean(), followPrompt: z.string().max(2000), finalMessage: z.string().max(2000),
  link: z.union([z.literal(''), z.url().max(2000).refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))]),
}).strict();
export type RecipeConfig = z.infer<typeof recipeConfig>;
export const emptyRecipe: RecipeConfig = { terms: [], introduction: '', publicReplyEnabled: false, publicReply: '',
  buttonEnabled: false, buttonTitle: '', followRequired: false, followPrompt: '', finalMessage: '', link: '' };
export const automationInput = z.object({ name: z.string().trim().min(1).max(100), mediaId: z.string().refine((value) => DEMO_REELS.some((reel) => reel.id === value)),
  config: recipeConfig }).strict();
export const normalizeText = (value: string) => value.normalize('NFKC').toLocaleLowerCase('pt-BR').trim().replace(/\s+/gu, ' ');
export const normalizeTerms = (terms: string[]) => [...new Set(terms.map(normalizeText).filter(Boolean))];
export function matchingTerm(text: string, terms: string[]) {
  const normalized = normalizeText(text);
  return normalizeTerms(terms).find((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').test(normalized);
  }) ?? null;
}
export function readyRecipe(config: RecipeConfig) {
  return config.terms.length > 0 && Boolean(config.introduction.trim() && config.finalMessage.trim() && config.link) &&
    (!config.publicReplyEnabled || Boolean(config.publicReply.trim())) && (!config.buttonEnabled || Boolean(config.buttonTitle.trim())) &&
    (!config.followRequired || Boolean(config.buttonEnabled && config.followPrompt.trim())) &&
    (config.buttonEnabled || `${config.introduction}\n${config.finalMessage}\n${config.link}`.length <= 2000);
}

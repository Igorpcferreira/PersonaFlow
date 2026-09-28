import { z } from 'zod';
import { DEMO_REELS } from '../../shared/demo-data';

export const LOCAL_RECIPE_CAPABILITIES = { publicReply: true, button: true, follow: true };
export const recipeConfig = z.object({ terms: z.array(z.string().trim().min(1).max(80)).max(20), introduction: z.string().max(2000),
  publicReplyEnabled: z.boolean(), publicReply: z.string().max(1500), buttonEnabled: z.boolean(), buttonTitle: z.string().max(80),
  followRequired: z.boolean(), followPrompt: z.string().max(2000), finalMessage: z.string().max(2000),
  link: z.union([z.literal(''), z.url().max(2000).refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))]),
}).strict();
export type RecipeConfig = z.infer<typeof recipeConfig>;
export const emptyRecipe: RecipeConfig = { terms: [], introduction: '', publicReplyEnabled: false, publicReply: '',
  buttonEnabled: false, buttonTitle: '', followRequired: false, followPrompt: '', finalMessage: '', link: '' };
export const triggers = ['comment', 'message', 'story'] as const;
export type RecipeTrigger = typeof triggers[number];
export const automationInput = z.object({ name: z.string().trim().min(1).max(100), trigger: z.enum(triggers).default('comment'),
  mediaId: z.string().nullable().default(null), config: recipeConfig }).strict().refine((value) => value.trigger === 'comment'
    ? DEMO_REELS.some((reel) => reel.id === value.mediaId) : value.mediaId === null);
export const normalizeText = (value: string) => value.normalize('NFKC').toLocaleLowerCase('pt-BR').trim().replace(/\s+/gu, ' ');
export const normalizeTerms = (terms: string[]) => [...new Set(terms.map(normalizeText).filter(Boolean))];
export function matchingTerm(text: string, terms: string[]) {
  const normalized = normalizeText(text);
  return normalizeTerms(terms).find((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').test(normalized);
  }) ?? null;
}
export const textReply = (config: RecipeConfig) => [config.introduction.trim(), config.finalMessage.trim(), config.link].filter(Boolean).join('\n');
export const isStopCommand = (text: string) => /^(parar|sair)[.!?]*$/u.test(normalizeText(text));
export function readyRecipe(config: RecipeConfig, trigger = 'comment') {
  if (trigger === 'message' || trigger === 'story') return config.terms.length > 0 && Boolean(config.introduction.trim()) &&
    !config.publicReplyEnabled && !config.buttonEnabled && !config.followRequired && textReply(config).length <= 2000;
  if (trigger !== 'comment') return false;
  return config.terms.length > 0 && Boolean(config.introduction.trim() && config.finalMessage.trim() && config.link) &&
    (!config.publicReplyEnabled || Boolean(config.publicReply.trim())) && (!config.buttonEnabled || Boolean(config.buttonTitle.trim())) &&
    (!config.followRequired || Boolean(config.buttonEnabled && config.followPrompt.trim())) &&
    (config.buttonEnabled ? `${config.finalMessage}\n${config.link}`.length <= 2000 : `${config.introduction}\n${config.finalMessage}\n${config.link}`.length <= 2000);
}

export type SequenceView = { id: string; accountId: string; conversationId: string; automationName: string; followRequired: boolean;
  state: string; followState: string; profileChecks: number; profileFixture: 'true' | 'false' | 'unknown' | 'error'; canInteract: boolean;
  introductionStatus: string | null; buttonStatus: string | null; linkStatus: string | null };

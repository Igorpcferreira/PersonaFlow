// Contrato sintético v1, sem dados de conta real. Não é evidência de formato/permissões Meta reais.
export function syntheticBatch(professionalIds: string[], eventId: string, at = new Date()) {
  return { object: 'instagram', future_field: { additive: true }, entry: professionalIds.map((professionalId) => ({
    id: professionalId, time: Math.floor(at.getTime() / 1000),
    changes: [{ field: 'comments', value: { id: eventId, from: { id: 'synthetic-contact' }, media: { id: 'synthetic-reel' }, text: 'site', unknown_field: 1 } }],
    messaging: [{ sender: { id: 'synthetic-contact' }, recipient: { id: professionalId }, timestamp: at.getTime(),
      message: { mid: eventId, text: 'Olá', additional_field: true } }],
  })) };
}

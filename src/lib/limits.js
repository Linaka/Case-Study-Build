export const TEXT_LIMITS = {
  short: 240,
  long: 5000,
  path: 1000,
  listItems: 20,
  assets: 12
};

export const PROJECT_FIELD_LIMITS = {
  title: TEXT_LIMITS.short,
  subtitle: TEXT_LIMITS.long,
  year: TEXT_LIMITS.short,
  sector: TEXT_LIMITS.short,
  clientType: TEXT_LIMITS.short,
  role: TEXT_LIMITS.short,
  collaborators: TEXT_LIMITS.long,
  context: TEXT_LIMITS.long,
  challenge: TEXT_LIMITS.long,
  audience: TEXT_LIMITS.long,
  approach: TEXT_LIMITS.long,
  reflection: TEXT_LIMITS.long,
  confidentialityNotes: TEXT_LIMITS.long,
  titleListTitle: TEXT_LIMITS.short,
  titleListDescription: TEXT_LIMITS.long,
  impactMetric: TEXT_LIMITS.short,
  assetPath: TEXT_LIMITS.path,
  assetCaption: TEXT_LIMITS.long
};

export const BD_FIELD_LIMITS = {
  title: TEXT_LIMITS.short,
  subtitle: TEXT_LIMITS.long,
  year: TEXT_LIMITS.short,
  audience: TEXT_LIMITS.short,
  positioning: TEXT_LIMITS.long,
  executivePromise: TEXT_LIMITS.long,
  processSummary: TEXT_LIMITS.long,
  nextSteps: TEXT_LIMITS.long,
  primaryCta: TEXT_LIMITS.short,
  secondaryCta: TEXT_LIMITS.short,
  titleListTitle: TEXT_LIMITS.short,
  titleListDescription: TEXT_LIMITS.long,
  offerTitle: TEXT_LIMITS.short,
  offerDescription: TEXT_LIMITS.long,
  offerDeliverables: TEXT_LIMITS.long,
  proofHeadline: TEXT_LIMITS.short,
  proofClientContext: TEXT_LIMITS.short,
  proofProjectSlug: TEXT_LIMITS.short,
  proofAssetPath: TEXT_LIMITS.path,
  proofBody: TEXT_LIMITS.long,
  engagementTitle: TEXT_LIMITS.short,
  engagementTimeline: TEXT_LIMITS.short,
  engagementBody: TEXT_LIMITS.long,
  assetPath: TEXT_LIMITS.path,
  assetCaption: TEXT_LIMITS.long,
  confidentialityNotes: TEXT_LIMITS.long
};

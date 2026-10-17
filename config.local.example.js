// Copy this file to config.local.js and fill in your keys.
// config.local.js is gitignored — it seeds AI provider settings into
// localStorage on first load (see llm.js). Keys match the
// storageKey/modelStorageKey fields in llmProviders (llm.js).
window.APPSCREEN_DEFAULTS = {
    aiProvider: 'openai',        // 'openai' | 'anthropic' | 'google'
    openaiApiKey: 'sk-...',
    openaiModel: 'gpt-5-mini-2025-08-07'
    // claudeApiKey: 'sk-ant-...',
    // anthropicModel: 'claude-sonnet-4-5-20250929',
    // googleApiKey: 'AIza...',
    // googleModel: 'gemini-2.5-flash'
};

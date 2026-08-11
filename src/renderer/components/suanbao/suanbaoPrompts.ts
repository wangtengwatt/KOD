export type SuanbaoPromptKind = 'explain-code' | 'analyze-error'

export function buildSuanbaoPrompt(kind: SuanbaoPromptKind, input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter code or an error message first.')
  return kind === 'explain-code'
    ? `Explain the following code clearly, including its purpose, key logic, and potential issues:\n\n${trimmed}`
    : `Analyze the following error. Explain the likely cause and give concrete steps to fix it:\n\n${trimmed}`
}

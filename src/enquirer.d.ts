declare module 'enquirer' {
  const Enquirer: { prompt(question: Record<string, unknown>): Promise<{ answer: any }> };
  export default Enquirer;
}

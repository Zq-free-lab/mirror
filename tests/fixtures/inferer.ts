/** Valid InfererOutput fixture (matches infererOutputSchema).
 *  rawConfidence ≤ 0.6 for single-evidence nodes — enforced by prompt & tested by AC-INF-1. */
export const infererOutputFixture = {
  inferences: [
    {
      system: "narrative",
      statement: "你倾向于把困难内化，用独自扛着来维持「我能行」的自我叙事",
      rawConfidence: 0.55,
      salience: 0.7,
      evidence: [
        { sourceMessageId: "msg-003", quote: "说了会显得我不行" },
      ],
    },
    {
      system: "social",
      statement: "你在表达脆弱时会预设对方无法提供有效帮助",
      rawConfidence: 0.45,
      salience: 0.5,
      evidence: [
        { sourceMessageId: "msg-003", quote: "说了也没用" },
      ],
    },
  ],
};

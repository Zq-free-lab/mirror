/** Valid ObserverOutput fixture (matches observerOutputSchema). */
export const observerOutputFixture = {
  facts: [
    {
      statement: "用户当前感到烦闷",
      system: "affect",
      evidence: [{ sourceMessageId: "msg-001", quote: "最近有点烦" }],
    },
  ],
  signals: [
    {
      kind: "avoidance",
      description: "用户明确表达不想与他人分享内心困扰",
      evidence: [{ sourceMessageId: "msg-001", quote: "不太想跟别人说" }],
      hintedSystem: "social",
    },
    {
      kind: "hesitation",
      description: "用户对自己回避的原因不确定",
      evidence: [{ sourceMessageId: "msg-003", quote: "我也不知道" }],
    },
  ],
};

/** Valid ReconcilerOutput fixture (matches reconcilerOutputSchema). */
export const reconcilerOutputFixture = {
  contradictions: [
    {
      nodeIdA: "node-narrative-001",
      nodeIdB: "node-social-001",
      explanation:
        "叙事核认为你强调独立，而他者之镜节点显示你期待他人理解——两者存在拉扯",
    },
  ],
  revisions: [
    {
      nodeId: "node-social-001",
      eventType: "reinforced",
      reason: "新消息进一步印证了用户预设他人无能为力的倾向",
    },
  ],
};

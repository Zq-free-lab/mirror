/** Valid SkepticOutput fixture (matches skepticOutputSchema). */
export const skepticOutputFixture = {
  judgments: [
    {
      targetIndex: 0,
      keep: true,
      isUncanny: false,
      skepticFlag: "仅基于1次对话，可能过拟合——建议多轮强化后置信度再提升",
    },
    {
      targetIndex: 1,
      keep: true,
      isUncanny: true,
      skepticFlag: "此推断有恐怖谷张力：你在预判我对你的判断是否准确",
    },
  ],
};

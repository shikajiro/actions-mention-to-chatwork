export const buildChatworkPostMentionMessage = (
  chatworkIdsForMention: string[],
  issueTitle: string,
  commentLink: string,
  githubBody: string,
  senderName: string,
): string => {
  const mentionBlock = chatworkIdsForMention
    .map((id) => `[To:${id}]`)
    .join(" ");
  return `[info][title]${senderName}がメンションしました[/title]${mentionBlock} ${issueTitle}\n${commentLink}\n[hr]\n${githubBody}\n[/info]`;
};

export const buildChatworkPostApproveMessage = (
  chatworkIdsForMention: string[],
  issueTitle: string,
  commentLink: string,
  githubBody: string,
  senderName: string,
): string => {
  const mentionBlock = chatworkIdsForMention
    .map((id) => `[To:${id}]`)
    .join(" ");
  return `[info][title](cracker)${senderName}が承認しました[/title]${mentionBlock} ${issueTitle}\n${commentLink}\n[hr]\n${githubBody}\n[/info]`;
};

export const buildChatworkPostMessage = (
  issueTitle: string,
  commentLink: string,
  githubBody: string,
  senderName: string,
): string => {
  return `[info][title]${senderName}がコメントしました[/title] ${issueTitle}\n${commentLink}\n[hr]\n${githubBody}\n[/info]`;
};

export const buildChatworkErrorMessage = (
  error: Error,
  currentJobUrl?: string,
): string => {
  const jobTitle = "mention-to-chatwork action";
  const jobLinkMessage = currentJobUrl
    ? `${currentJobUrl} ${jobTitle}`
    : jobTitle;

  const issueBody = error.stack
    ? encodeURI(["```", error.stack, "```"].join("\n"))
    : "";

  const link = encodeURI(
    `${openIssueLink}?title=${error.message}&body=${issueBody}`,
  );

  return [
    `❗ An internal error occurred in ${jobLinkMessage}`,
    "(but action didn't fail as this action is not critical).",
    `To solve the problem, please ${link} open an issue`,
    "",
    "```",
    error.stack || error.message,
    "```",
  ].join("\n");
};
const openIssueLink =
  "https://github.com/shikajiro/actions-mention-to-chatwork/issues/new";

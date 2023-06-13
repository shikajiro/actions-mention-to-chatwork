import axios from "axios";

export const buildChatworkPostMessage = (
  chatworkIdsForMention: string[],
  issueTitle: string,
  commentLink: string,
  githubBody: string,
  senderName: string
): string => {
  const mentionBlock = chatworkIdsForMention.map((id) => `[To:${id}]`).join(" ");
  const body = githubBody;

  const message = [
    mentionBlock,
    `${chatworkIdsForMention.length === 1 ? "has" : "have"}`,
    `been mentioned at ${commentLink} ${issueTitle} by ${senderName}`,
  ].join(" ");

  return `${message}\n${body}`;
};

export const buildChatworkErrorMessage = (
  error: Error,
  currentJobUrl?: string
): string => {
  const jobTitle = "mention-to-chatwork action";
  const jobLinkMessage = currentJobUrl
    ? `${currentJobUrl} ${jobTitle}`
    : jobTitle;

  const issueBody = error.stack
    ? encodeURI(["```", error.stack, "```"].join("\n"))
    : "";

  const link = encodeURI(
    `${openIssueLink}?title=${error.message}&body=${issueBody}`
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
type ChatworkPostResult = Record<string, unknown>;

export const ChatworkRepositoryImpl = {
  postToChatwork: async (
    apiToken: string,
    roomId: string,
    message: string
  ): Promise<ChatworkPostResult> => {
    const chatworkUrl = `https://api.chatwork.com/v2/rooms/${roomId}/messages`

    const result = await axios.post<ChatworkPostResult>(
      chatworkUrl,
      `body=${message}`,
      {
        headers: { "X-ChatWorkToken": apiToken },
      }
    );

    return result.data;
  },
};

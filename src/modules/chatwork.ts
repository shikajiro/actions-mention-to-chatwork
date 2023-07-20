import * as core from "@actions/core";
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
type ChatworkGetTaskResult = [
  {
    body: string
  }
];

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

  createChatworkTask: async (
    apiToken: string,
    roomId: string,
    accountId: string,
    message: string,
    labels: string[]
  ): Promise<ChatworkPostResult> => {
    const isHurry = labels.find((label) => label === 'hurry');
    const is2days = labels.find((label) => label === '2days');
    let limit = 0;
    const now = new Date();
    if(isHurry !== undefined) {
      limit = new Date(now.getFullYear(), now.getMonth()+1, now.getDate(), 23, 59, 59).getTime();
    }else if(is2days !== undefined) {
      limit = new Date(now.getFullYear(), now.getMonth()+1, now.getDate()+2, 23, 59, 59).getTime();
    }else{
      // is2weeks or default
      limit = new Date(now.getFullYear(), now.getMonth()+1, now.getDate()+14, 23, 59, 59).getTime();
    }
    const encodedParams = new URLSearchParams();
    encodedParams.set('body', message);
    encodedParams.set('to_ids', accountId);
    encodedParams.set('limit', `${limit / 1000}`);
    encodedParams.set('limit_type', "date");
    core.info(`param ${encodedParams}`);
    const result = await axios.post<ChatworkPostResult>(
      `https://api.chatwork.com/v2/rooms/${roomId}/tasks`,
      encodedParams,
      {
        headers: { "X-ChatWorkToken": apiToken },
      }
    );

    return result.data;
  },

  existChatworkTask: async (
    apiToken: string,
    roomId: string,
    accountId: string,
    message: string,
  ): Promise<boolean> => {
    const result = await axios.get<ChatworkGetTaskResult>(
      `https://api.chatwork.com/v2/rooms/${roomId}/tasks?account_id=${accountId}&status=open`,
      {
        headers: { "X-ChatWorkToken": apiToken },
      }
    );
    core.info(`result data ${result.data}`);

    const task = result.data.find((task) => task.body === message );
    return !!task;
  },
};

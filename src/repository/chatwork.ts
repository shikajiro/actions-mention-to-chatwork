import * as core from "@actions/core";
import axios from "axios";

type ChatworkPostResult = Record<string, unknown>;
type ChatworkGetTaskResult = [
  {
    body: string;
  },
];

export const ChatworkRepositoryImpl = {
  postToChatwork: async (
    apiToken: string,
    roomId: string,
    message: string,
  ): Promise<ChatworkPostResult> => {
    const chatworkUrl = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;

    const result = await axios.post<ChatworkPostResult>(
      chatworkUrl,
      `body=${message}`,
      {
        headers: { "X-ChatWorkToken": apiToken },
      },
    );

    return result.data;
  },

  createChatworkTask: async (
    apiToken: string,
    roomId: string,
    accountId: string,
    message: string,
  ): Promise<ChatworkPostResult> => {
    const now = new Date();
    const limit = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 14,
      23,
      59,
      59
    );
    const encodedParams = new URLSearchParams();
    encodedParams.set("body", message);
    encodedParams.set("to_ids", accountId);
    encodedParams.set("limit", `${limit / 1000}`);
    encodedParams.set("limit_type", "date");
    core.info(`param ${encodedParams}`);
    const result = await axios.post<ChatworkPostResult>(
      `https://api.chatwork.com/v2/rooms/${roomId}/tasks`,
      encodedParams,
      {
        headers: { "X-ChatWorkToken": apiToken },
      },
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
      },
    );
    core.info(`result data ${JSON.stringify(result.data, null, 2)}`);
    if (!result.data) return false;

    const task = result.data.find((task) => task.body === message);
    return !!task;
  },
};

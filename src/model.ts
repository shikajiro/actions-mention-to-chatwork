import * as core from "@actions/core";
import { stringify } from "ts-jest";

export type AllInputs = {
  repoToken: string;
  configurationPath: string;
  apiToken: string;
  runId?: string;
  reviewRequest?: boolean;
};

export const getAllInputs = (): AllInputs => {
  const configurationPath = core.getInput("configuration-path", {
    required: true,
  });
  const repoToken = core.getInput("repo-token", { required: true });
  if (!repoToken) {
    core.setFailed("Error! Need to set `repo-token`.");
  }
  const apiToken = core.getInput("api-token", { required: true });
  const runId = core.getInput("run-id", { required: false });
  const reviewRequest = core.getBooleanInput("review-request", {
    required: true,
  });

  return {
    repoToken,
    configurationPath,
    apiToken,
    runId,
    reviewRequest,
  };
};

export type Account = {
  room_id: string;
  account_id: string;
};

export type MappingFile = {
  [githubUsername: string]: Account;
};

export const convertToChatworkUsername = (
  githubUsernames: string[],
  mapping: MappingFile,
): Account[] => {
  core.info(stringify(githubUsernames));

  const slackIds = githubUsernames.map(
    (githubUsername) => mapping[githubUsername],
  );
  core.info(stringify(slackIds));

  return slackIds;
};

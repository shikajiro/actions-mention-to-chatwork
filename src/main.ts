import * as core from "@actions/core";
import { context } from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";

import {
  pickupUsername,
  pickupInfoFromGithubPayload,
  needToSendApproveMention, latestReviewer, needToMention,
} from "./modules/github";
import {
  buildChatworkErrorMessage, buildChatworkPostMentionMessage,
  buildChatworkPostMessage,
  ChatworkRepositoryImpl,
} from "./modules/chatwork";
import {
  MappingConfigRepositoryImpl,
  isUrl,
  MappingFile, Account,
} from "./modules/mappingConfig";

export type AllInputs = {
  repoToken: string;
  configurationPath: string;
  apiToken: string;
  runId?: string;
  reviewRequest?: string;
  action?: string;
};

export const arrayDiff = <T>(arr1: T[], arr2: T[]) =>
  arr1.filter((i) => arr2.indexOf(i) === -1);

export const convertToChatworkUsername = (
  githubUsernames: string[],
  mapping: MappingFile
): Account[] => {
  core.info(JSON.stringify({ githubUsernames }, null, 2));
  const slackIds = githubUsernames
    .map((githubUsername) => mapping[githubUsername]);

  core.info(JSON.stringify({ slackIds }, null, 2));

  return slackIds;
};

export const execArtifact = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "existChatworkTask" | "createChatworkTask">
): Promise<void> => {
  const name = payload.repository?.full_name;
  if (name === undefined) {
    throw new Error("Can not find repository name.");
  }

  const number = payload.pull_request?.number;
  if (number === undefined) {
    throw new Error("Can not find pull request number.");
  }

  const reviewer = await latestReviewer(name, number, allInputs.repoToken)
  if (reviewer === null) {
    throw new Error("Can not find review requested user.");
  }
  core.info(`reviewer ${ reviewer }`);

  core.info(`labels ${ payload.pull_request?.labels[0]?.name}`);
  const labels = payload.pull_request?.labels
      ?.map((label:any) => label.name)
      ?.filter((name:any) => name === 'hurry' || name === '2days' || name === '2weeks') as string[];

  const slackIds = convertToChatworkUsername([reviewer], mapping);
  if (slackIds.length === 0) {
    core.info("finish execPrReviewRequestedMention because slackIds.length === 0");
    return;
  }

  const account = slackIds[0];
  const roomId = account.room_id;
  if (roomId === undefined) {
    throw new Error("Can not find room ID.");
  }

  const requestUsername = payload.sender?.login;
  const prUrl = payload.pull_request?.html_url;
  const prTitle = payload.pull_request?.title;

  const message = `[To:${account.account_id}] (bow) has been requested to review PR:${prTitle} ${prUrl} by ${requestUsername}.`;
  const { apiToken } = allInputs;

  const exist = await chatworkClient.existChatworkTask(apiToken, roomId, account.account_id, message);
  if (exist) {
    core.info(`already exist ${message}`);
    return;
  }

  await chatworkClient.createChatworkTask(apiToken, account.room_id, account.account_id, message, labels);
};

export const execPrReviewRequestedMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "postToChatwork">
): Promise<void> => {
  const requestedGithubUsername =
    payload.requested_reviewer?.login || payload.requested_team?.name;

  if (!requestedGithubUsername) {
    throw new Error("Can not find review requested user.");
  }

  const slackIds = convertToChatworkUsername([requestedGithubUsername], mapping);

  if (slackIds.length === 0) {
    core.info(
      "finish execPrReviewRequestedMention because slackIds.length === 0"
    );
    return;
  }

  const account = slackIds[0];
  const roomId = account.room_id;
  if (roomId === undefined) {
    throw new Error("Can not find room ID.");
  }

  const title = payload.pull_request?.title;
  const url = payload.pull_request?.html_url;
  const requestUsername = payload.sender?.login;

  const message = `[To:${account.account_id}] has been requested to review ${url} ${title} by ${requestUsername}.`;
  const { apiToken } = allInputs;

  await chatworkClient.postToChatwork(apiToken, roomId, message);
};

export const execNormalComment = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "postToChatwork">
): Promise<void> => {
  const info = pickupInfoFromGithubPayload(payload);

  if (info.body === null) {
    core.info("finish execNormalMention because info.body === null");
    return;
  }

  const message = buildChatworkPostMessage(
      info.title,
      info.url,
      info.body,
      info.senderName
  );

  const account = mapping[info.senderName];

  const result = await chatworkClient.postToChatwork(allInputs.apiToken, account.room_id, message);

  core.info(
      ["postToSlack result", JSON.stringify({result}, null, 2)].join("\n")
  );

};

export const execNormalMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "postToChatwork">
): Promise<void> => {
  const info = pickupInfoFromGithubPayload(payload);

  if (info.body === null) {
    core.info("finish execNormalMention because info.body === null");
    return;
  }

  const githubUsernames = pickupUsername(info.body);
  if (githubUsernames.length === 0) {
    core.info("finish execNormalMention because githubUsernames.length === 0");
    return;
  }

  const slackIds = convertToChatworkUsername(githubUsernames, mapping);

  if (slackIds.length === 0) {
    core.info("finish execNormalMention because slackIds.length === 0");
    return;
  }

  for (const account of slackIds) {
    const roomId = account.room_id;
    if (roomId === undefined) {
      continue;
    }

    const message = buildChatworkPostMentionMessage(
        [account.account_id],
        info.title,
        info.url,
        info.body,
        info.senderName
    );

    const {apiToken} = allInputs;

    const result = await chatworkClient.postToChatwork(apiToken, roomId, message);

    core.info(
        ["postToSlack result", JSON.stringify({result}, null, 2)].join("\n")
    );
  }
};

export const execApproveMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "postToChatwork">
): Promise<string | null> => {
  if (!needToSendApproveMention(payload)) {
    throw new Error("failed to parse payload");
  }

  const prOwnerGithubUsername = payload.pull_request?.user?.login;

  if (!prOwnerGithubUsername) {
    throw new Error("Can not find pr owner user.");
  }

  const slackIds = convertToChatworkUsername([prOwnerGithubUsername], mapping);

  if (slackIds.length === 0) {
    core.info("finish execApproveMention because slackIds.length === 0");
    return null;
  }

  const account = slackIds[0];
  const roomId = account.room_id;
  if (roomId === undefined) {
    throw new Error("Can not find room ID.");
  }

  const info = pickupInfoFromGithubPayload(payload);
  const approveOwner = payload.sender?.login;
  const message = [
    `[To:${account.account_id}] (cracker) has been approved ${info.url} ${info.title} by ${approveOwner}.`,
    info.body || "",
  ].join("\n");
  const { apiToken} = allInputs;

  const postSlackResult = await chatworkClient.postToChatwork(
    apiToken,
    account.room_id,
    message
  );

  core.info(
    ["postToSlack result", JSON.stringify({ postSlackResult }, null, 2)].join(
      "\n"
    )
  );

  return account.account_id;
};

const buildCurrentJobUrl = (runId: string) => {
  const { owner, repo } = context.repo;
  return `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
};

export const execPostError = async (
  error: Error,
  allInputs: AllInputs
): Promise<void> => {
  const { runId } = allInputs;
  const currentJobUrl = runId ? buildCurrentJobUrl(runId) : undefined;
  const message = buildChatworkErrorMessage(error, currentJobUrl);

  core.warning(message);
};

const getAllInputs = (): AllInputs => {
  const configurationPath = core.getInput("configuration-path", {
    required: true,
  });
  const repoToken = core.getInput("repo-token", { required: true });
  if (!repoToken) {
    core.setFailed("Error! Need to set `repo-token`.");
  }
  const apiToken = core.getInput("api-token", { required: true });
  const runId = core.getInput("run-id", { required: false });
  const reviewRequest = core.getInput("review-request", { required: true });
  const action = core.getInput("action", { required: false });

  return {
    repoToken,
    configurationPath,
    apiToken,
    runId,
    reviewRequest,
    action,
  };
};

export const main = async (): Promise<void> => {
  core.info("start main()");

  const { payload } = context;
  core.info(JSON.stringify({ payload }, null, 2));

  const allInputs = getAllInputs();
  core.info(JSON.stringify({ allInputs }, null, 2));

  const { repoToken, configurationPath, reviewRequest,  action } = allInputs;

  try {
    const mapping = await (async () => {
      if (isUrl(configurationPath)) {
        return MappingConfigRepositoryImpl.loadFromUrl(configurationPath);
      }

      return MappingConfigRepositoryImpl.loadFromGithubPath(
        repoToken,
        context.repo.owner,
        context.repo.repo,
        configurationPath,
        context.sha
      );
    })();

    core.info(JSON.stringify({ mapping }, null, 2));

    if(action === "artifact") {
      await execArtifact(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      )
      core.info("finish execArtifact()");
      return;
    }

    if (reviewRequest && payload.action === "review_requested") {
      await execPrReviewRequestedMention(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      );
      core.info("finish execPrReviewRequestedMention()");
      return;
    }

    if (needToSendApproveMention(payload)) {
      const sentSlackUserId = await execApproveMention(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      );

      core.info(
        [
          "execApproveMention()",
          JSON.stringify({ sentSlackUserId }, null, 2),
        ].join("\n")
      );
      return;
    }

    if (needToMention(payload, mapping)) {
      await execNormalMention(
          payload,
          allInputs,
          mapping,
          ChatworkRepositoryImpl,
      );
      core.info("finish execNormalMention()");
      return;
    }

    await execNormalComment(
          payload,
          allInputs,
          mapping,
          ChatworkRepositoryImpl,
      );
    core.info("finish execNormalComment()");

  } catch (error: any) {
    await execPostError(error, allInputs);
    core.warning(JSON.stringify({ payload }, null, 2));
  }
};

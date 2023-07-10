import * as core from "@actions/core";
import { context } from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";

import {
  pickupUsername,
  pickupInfoFromGithubPayload,
  needToSendApproveMention,
} from "./modules/github";
import {
  buildChatworkErrorMessage,
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
  core.debug(JSON.stringify({ githubUsernames }, null, 2));
  const slackIds = githubUsernames
    .map((githubUsername) => mapping[githubUsername]);

  core.debug(JSON.stringify({ slackIds }, null, 2));

  return slackIds;
};

export const execArtifact = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "createChatworkTask">
): Promise<void> => {
  core.info(`pull_request ${ JSON.stringify(payload, null, 2)}`);
  core.info(`login ${ payload.pull_request?.requested_reviewers[0]?.login}`);
  const requestedGithubUsername =
    payload.pull_request?.requested_reviewers[0]?.login || payload.pull_request?.requested_teams[0]?.name;

  if (!requestedGithubUsername) {
    throw new Error("Can not find review requested user.");
  }

  core.info(`labels ${ payload.pull_request?.labels[0]?.name}`);
  const labels = payload.pull_request?.labels
      ?.map((label:any) => label.name)
      ?.filter((name:any) => name === 'hurry' || name === '2days' || name === '2weeks') as string[];

  const slackIds = convertToChatworkUsername([requestedGithubUsername], mapping);
  if (slackIds.length === 0) {
    core.debug(
      "finish execPrReviewRequestedMention because slackIds.length === 0"
    );
    return;
  }

  const account = slackIds[0];
  const requestUsername = payload.sender?.login;
  const prUrl = payload.pull_request?.html_url;

  const message = `[To:${account.account_id}] (bow) has been requested to review PR:${prUrl} by ${requestUsername}.`;
  const { apiToken } = allInputs;

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
    core.debug(
      "finish execPrReviewRequestedMention because slackIds.length === 0"
    );
    return;
  }

  const title = payload.pull_request?.title;
  const url = payload.pull_request?.html_url;
  const account = slackIds[0];
  const requestUsername = payload.sender?.login;

  const message = `[To:${account.account_id}] has been requested to review ${url} ${title} by ${requestUsername}.`;
  const { apiToken } = allInputs;

  await chatworkClient.postToChatwork(apiToken, account.room_id, message);
};

export const execNormalMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
  chatworkClient: Pick<typeof ChatworkRepositoryImpl, "postToChatwork">
): Promise<void> => {
  const info = pickupInfoFromGithubPayload(payload);

  if (info.body === null) {
    core.debug("finish execNormalMention because info.body === null");
    return;
  }

  const githubUsernames = pickupUsername(info.body);
  if (githubUsernames.length === 0) {
    core.debug("finish execNormalMention because githubUsernames.length === 0");
    return;
  }

  const slackIds = convertToChatworkUsername(githubUsernames, mapping);

  if (slackIds.length === 0) {
    core.debug("finish execNormalMention because slackIds.length === 0");
    return;
  }

  for (const account of slackIds) {
    const message = buildChatworkPostMessage(
        [account.account_id],
        info.title,
        info.url,
        info.body,
        info.senderName
    );

    const {apiToken} = allInputs;

    const result = await chatworkClient.postToChatwork(apiToken, account.room_id, message);

    core.debug(
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
    core.debug("finish execApproveMention because slackIds.length === 0");
    return null;
  }

  const info = pickupInfoFromGithubPayload(payload);
  const account = slackIds[0];
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

  core.debug(
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
  core.debug("start main()");

  const { payload } = context;
  core.debug(JSON.stringify({ payload }, null, 2));

  const allInputs = getAllInputs();
  core.debug(JSON.stringify({ allInputs }, null, 2));

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

    core.debug(JSON.stringify({ mapping }, null, 2));

    if(action === "artifact") {
      await execArtifact(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      )
      core.debug("finish execArtifact()");
      return;
    }

    if (reviewRequest && payload.action === "review_requested") {
      await execPrReviewRequestedMention(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      );
      core.debug("finish execPrReviewRequestedMention()");
      return;
    }

    if (needToSendApproveMention(payload)) {
      const sentSlackUserId = await execApproveMention(
        payload,
        allInputs,
        mapping,
        ChatworkRepositoryImpl
      );

      core.debug(
        [
          "execApproveMention()",
          JSON.stringify({ sentSlackUserId }, null, 2),
        ].join("\n")
      );
    }

    await execNormalMention(
      payload,
      allInputs,
      mapping,
      ChatworkRepositoryImpl,
    );
    core.debug("finish execNormalMention()");
  } catch (error: any) {
    await execPostError(error, allInputs);
    core.warning(JSON.stringify({ payload }, null, 2));
  }
};

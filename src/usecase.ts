import { WebhookPayload } from "@actions/github/lib/interfaces";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { ChatworkRepositoryImpl } from "./repository/chatwork";
import { latestReviewer } from "./repository/github";
import { isUrl, MappingConfigRepositoryImpl } from "./repository/mappingConfig";
import { AllInputs, convertToChatworkUsername, MappingFile } from "./model";
import {
  buildChatworkErrorMessage,
  buildChatworkPostApproveMessage,
  buildChatworkPostMentionMessage,
  buildChatworkPostMessage,
} from "./domain/chatwork";
import {
  buildCurrentJobUrl,
  needToSendApproveMention,
  pickupInfoFromGithubPayload,
  pickupUsername,
} from "./domain/github";

/**
 * レビュー依頼があった際にタスクを作成する
 */
export const execPrReviewRequestedMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
): Promise<void> => {
  core.info("start execPrReviewRequestedMention()");

  const name = payload.repository?.full_name;
  if (name === undefined) {
    throw new Error("Can not find repository name.");
  }

  const number = payload.pull_request?.number || payload.inputs?.pr_number?.toNumber();
  if (number === undefined) {
    throw new Error("Can not find pull request number.");
  }

  const reviewers = await latestReviewer(name, number, allInputs.repoToken);
  if (reviewers === null || reviewers.length == 0) {
    throw new Error("Can not find review requested user.");
  }
  core.info(`reviewers ${reviewers}`);

  const slackIds = convertToChatworkUsername(reviewers, mapping);
  if (slackIds.length === 0) {
    core.info(
      "finish execPrReviewRequestedMention because slackIds.length === 0",
    );
    return;
  }

  for (const account of slackIds) {
    const roomId = account.room_id;
    if (roomId === undefined) {
      throw new Error("Can not find room ID.");
    }

    const requestUsername = payload.sender?.login;
    const prUrl = payload.pull_request?.html_url;
    const prTitle = payload.pull_request?.title;

    const message = `[To:${account.account_id}] (bow) has been requested to review PR:${prTitle} ${prUrl} by ${requestUsername}.`;
    const { apiToken } = allInputs;

    const exist = await ChatworkRepositoryImpl.existChatworkTask(
      apiToken,
      roomId,
      account.account_id,
      message,
    );

    if (exist) {
      core.info(`already exist ${message}`);
      return;
    }

    await ChatworkRepositoryImpl.createChatworkTask(
      apiToken,
      account.room_id,
      account.account_id,
      message,
    );
  }
};

/**
 * PRにコメントが合った際にチャットルームにメッセージを送る
 */
export const execNormalComment = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
): Promise<void> => {
  core.info("start execNormalComment()");

  const info = pickupInfoFromGithubPayload(payload);

  if (info.body === null) {
    core.info("finish execNormalMention because info.body === null");
    return;
  }

  const message = buildChatworkPostMessage(
    info.title,
    info.url,
    info.body,
    info.senderName,
  );

  const account = mapping[info.senderName];

  const result = await ChatworkRepositoryImpl.postToChatwork(
    allInputs.apiToken,
    account.room_id,
    message,
  );

  core.info(
    ["postToSlack result", JSON.stringify({ result }, null, 2)].join("\n"),
  );
};

/**
 * PRにメンション付きコメントが合った際にチャットルームにメンション付きメッセージを送る
 */
export const execNormalMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
): Promise<void> => {
  core.info("start execNormalMention()");

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
      info.senderName,
    );

    const { apiToken } = allInputs;

    const result = await ChatworkRepositoryImpl.postToChatwork(
      apiToken,
      roomId,
      message,
    );

    core.info(
      ["postToSlack result", JSON.stringify({ result }, null, 2)].join("\n"),
    );
  }
};

/**
 * PRがapproveされた際にPR作成者にメンションを付けてチャットルームにメッセージを送る
 */
export const execApproveMention = async (
  payload: WebhookPayload,
  allInputs: AllInputs,
  mapping: MappingFile,
): Promise<string | null> => {
  core.info("start execApproveMention()");

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
  const message = buildChatworkPostApproveMessage(
    [account.account_id],
    info.title,
    info.url,
    info.body,
    payload.sender?.login,
  );
  const { apiToken } = allInputs;

  const postResult = await ChatworkRepositoryImpl.postToChatwork(
    apiToken,
    account.room_id,
    message,
  );

  core.info(
    [
      "postToSlack result",
      JSON.stringify({ postSlackResult: postResult }, null, 2),
    ].join("\n"),
  );

  return account.account_id;
};

/**
 * マッピングファイルを解釈
 */
export const execLoadMapping = async (
  configurationPath: string,
  repoToken: string,
) => {
  if (isUrl(configurationPath)) {
    return MappingConfigRepositoryImpl.loadFromUrl(configurationPath);
  }

  return MappingConfigRepositoryImpl.loadFromGithubPath(
    repoToken,
    context.repo.owner,
    context.repo.repo,
    configurationPath,
    context.sha,
  );
};

/**
 * エラーハンドリングを行う
 */
export const postError = async (
  error: Error,
  allInputs: AllInputs,
): Promise<void> => {
  const { runId } = allInputs;
  const currentJobUrl = runId ? buildCurrentJobUrl(runId) : undefined;
  const message = buildChatworkErrorMessage(error, currentJobUrl);
  core.warning(message);
};

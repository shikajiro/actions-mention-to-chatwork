import { WebhookPayload } from "@actions/github/lib/interfaces";
import axios from "axios";
import * as core from "@actions/core";
import {convertToChatworkUsername} from "../main";
import {MappingFile} from "./mappingConfig";

const uniq = <T>(arr: T[]): T[] => [...new Set(arr)];

export const pickupUsername = (text: string): string[] => {
  const pattern = /\B@[a-z0-9_-]+/gi;
  const hits = text.match(pattern);

  if (hits === null) {
    return [];
  }

  return uniq(hits).map((username) => username.replace("@", ""));
};

const acceptActionTypes = {
  issues: ["opened", "edited"],
  issue_comment: ["created", "edited"],
  pull_request: ["opened", "edited", "review_requested"],
  pull_request_review: ["submitted"],
  pull_request_review_comment: ["created", "edited"],
};

const buildError = (payload: unknown): Error => {
  return new Error(
    `unknown event hook: ${JSON.stringify(payload, undefined, 2)}`
  );
};

export const needToSendApproveMention = (payload: WebhookPayload): boolean => {
  if (payload.review?.state === "approved") {
    return true;
  }

  return false;
};

export const needToMention = (payload: WebhookPayload, mapping: MappingFile,): boolean => {
  const info = pickupInfoFromGithubPayload(payload);

  if (info.body === null) {
    core.debug("finish execNormalMention because info.body === null");
    return false;
  }

  const githubUsernames = pickupUsername(info.body);
  if (githubUsernames.length === 0) {
    core.debug("finish execNormalMention because githubUsernames.length === 0");
    return false;
  }

  const slackIds = convertToChatworkUsername(githubUsernames, mapping);
  if (slackIds.length === 0) {
    core.debug("finish execNormalMention because slackIds.length === 0");
    return false;
  }

  return true;
};

type GithubGetReviewerResult = {
  users: GithubGetReviewerNameResult[]
};

type GithubGetReviewerNameResult = {
  login: string
};

export const latestReviewer = async (repoName: string, prNumber: number, repoToken:string): Promise<string | null> => {
  core.info(`repoName:${repoName} prNumber: ${prNumber}`);
  const result = await axios.get<GithubGetReviewerResult>(
    `https://api.github.com/repos/${repoName}/pulls/${prNumber}/requested_reviewers`,
    {
      headers: { "authorization": `Bearer ${repoToken}` },
    }
  );
  if(result.data.users.length == 0) return null;

  return result.data.users[0].login;
};

export const pickupInfoFromGithubPayload = (
  payload: WebhookPayload
): {
  body: string | null;
  title: string;
  url: string;
  senderName: string;
} => {
  const { action } = payload;

  if (action === undefined) {
    throw buildError(payload);
  }

  if (payload.issue) {
    if (payload.comment) {
      if (!acceptActionTypes.issue_comment.includes(action)) {
        throw buildError(payload);
      }

      return {
        body: payload.comment.body,
        title: payload.issue.title,
        url: payload.comment.html_url,
        senderName: payload.sender?.login || "",
      };
    }

    if (!acceptActionTypes.issues.includes(action)) {
      throw buildError(payload);
    }

    return {
      body: payload.issue.body || "",
      title: payload.issue.title,
      url: payload.issue.html_url || "",
      senderName: payload.sender?.login || "",
    };
  }

  if (payload.pull_request) {
    if (payload.review) {
      if (!acceptActionTypes.pull_request_review.includes(action)) {
        throw buildError(payload);
      }

      return {
        body: payload.review.body,
        title: payload.pull_request?.title || "",
        url: payload.review.html_url,
        senderName: payload.sender?.login || "",
      };
    }

    if (payload.comment) {
      if (!acceptActionTypes.issue_comment.includes(action)) {
        throw buildError(payload);
      }

      return {
        body: payload.comment.body,
        title: payload.pull_request.title,
        url: payload.comment.html_url,
        senderName: payload.sender?.login || "",
      };
    }
  }

  throw buildError(payload);
};

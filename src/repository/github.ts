import axios from "axios";
import * as core from "@actions/core";

type GithubGetPR = {
  requested_reviewers: GithubGetReviewerNameResult[];
  title: string;
  html_url: string;
};

type GithubGetReviewerNameResult = {
  login: string;
};

export const getPR = async (
  repoName: string,
  prNumber: number,
  repoToken: string,
): Promise<GithubGetPR | null> => {
  core.info(`repoName:${repoName} prNumber: ${prNumber}`);
  const result = await axios.get<GithubGetPR>(
    `https://api.github.com/repos/${repoName}/pulls/${prNumber}`,
    {
      headers: { authorization: `Bearer ${repoToken}` },
    },
  );
  if (result.data.requested_reviewers.length == 0) return null;

  return result.data;
};

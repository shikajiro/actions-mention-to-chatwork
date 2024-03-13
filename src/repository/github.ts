import axios from "axios";
import * as core from "@actions/core";

type GithubGetPR = {
  users: GithubGetReviewerNameResult[];
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
  return result.data;
};

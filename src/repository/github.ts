import axios from "axios";
import * as core from "@actions/core";

type GithubGetReviewerResult = {
  users: GithubGetReviewerNameResult[];
};

type GithubGetReviewerNameResult = {
  login: string;
};

export const latestReviewer = async (
  repoName: string,
  prNumber: number,
  repoToken: string,
): Promise<string[] | null> => {
  core.info(`repoName:${repoName} prNumber: ${prNumber}`);
  const result = await axios.get<GithubGetReviewerResult>(
    `https://api.github.com/repos/${repoName}/pulls/${prNumber}/requested_reviewers`,
    {
      headers: { authorization: `Bearer ${repoToken}` },
    },
  );
  if (result.data.users.length == 0) return null;

  return result.data.users.map((user) => user.login);
};

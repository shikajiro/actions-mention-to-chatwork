import * as core from "@actions/core";
import { context } from "@actions/github";

import {
  execApproveMention,
  execLoadMapping,
  execNormalComment,
  execNormalMention,
  execPrReviewRequestedMention,
  postError,
} from "./usecase";
import { getAllInputs } from "./model";
import { needToMention, needToSendApproveMention } from "./domain/github";

export const main = async (): Promise<void> => {
  core.info("start main");

  const { payload } = context;
  core.info(JSON.stringify(payload));

  const allInputs = getAllInputs();
  core.info(JSON.stringify(allInputs));

  const { repoToken, configurationPath, reviewRequest } = allInputs;

  try {
    const mapping = await execLoadMapping(configurationPath, repoToken);
    core.info(JSON.stringify(mapping));

    if (reviewRequest) {
      await execPrReviewRequestedMention(payload, allInputs, mapping);
      core.info("finish execPrReviewRequestedMention()");
    } else if (needToSendApproveMention(payload)) {
      await execApproveMention(payload, allInputs, mapping);
      core.info("finish execApproveMention()");
    } else if (needToMention(payload, mapping)) {
      await execNormalMention(payload, allInputs, mapping);
      core.info("finish execNormalMention()");
    } else {
      await execNormalComment(payload, allInputs, mapping);
      core.info("finish execNormalComment()");
    }
  } catch (error: any) {
    await postError(error, allInputs);
  }
};

# Convert Github mention to Chatwork mention

This action sends mention to your Chatwork account when you have been mentioned at github.

## Feature

- Send mention to Chatwork if you have been mentioned
  - issue
  - pull request
- Send notification to Chatwork if you have been requested to review.
- Send notification to Chatwork if your pull request have been approved.

## Inputs

| Name               | Required | Default                      | Description                                                                                                                                                 |
|:-------------------| :------- | :--------------------------- |:------------------------------------------------------------------------------------------------------------------------------------------------------------|
| configuration-path | Yes      | .github/mention-to-Chatwork.yml | Path to config-yaml-file to convert Github username to Chatwork member ID. You can use local file path or URL like https://github.com/path/to/yaml_raw_file |
| repo-token         | Yes      | Null                         | Github access token to fetch .github/mention-to-chatwork.yml file.                                                                                          |
| api-token          | Yes       | Null      | Chatwork access token.                                                                                                                                      |
| run-id             | No       | Null                         | Used for the link in the error message when an error occurs.                                                                                                |

## Example usage

.github/workflows/mention-to-chatwork.yml

```yml
on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]
  pull_request:
    types: [opened, edited, review_requested]
  pull_request_review:
    types: [submitted]
  pull_request_review_comment:
    types: [created, edited]

jobs:
  mention-to-Chatwork:
    runs-on: ubuntu-latest
    steps:
      - name: Run
        uses: shikajiro/actions-mention-to-chatwork@v2
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          api-token: ${{ secrets.CHATWORK_API_TOKEN }}
          run-id: ${{ github.run_id }}
```

.github/mention-to-chatwork.yml

```yml
# For Github User

github_username_A: 
  room_id: 123456789
  account_id: 123456789
```

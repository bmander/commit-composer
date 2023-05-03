# Commit Composer

Commit Composer is a Visual Studio Code extension that helps you write better commit messages using AI. CommitComposer uses the OpenAI API to generate a commit message from the git diff that (usually!) complies with the advice in [How to Write a Git Commit Message](https://chris.beams.io/posts/git-commit/).

## Features

- Adds "Draft Commit Message" command to the command palette, which opens up a new editor window and uses the OpenAI API to convert the git diff to a commit message.
- The commit composition editor has a context menu item "Copy All And Close" which copies the commit message to the clipboard and closes the editor window. The commit message body is wrapped at 74 characters before it is copied into the clipboard, ready to be pasted into the commit message editor.
- Sometimes the first draft AI-generated scommit message misses the point. When that happens, you can replace the title in the commit message editor and run "Draft Commit Body Using Title" from the context menu. The new body will incorporate information from both the diff and the title.

## Requirements

Git must be installed and available in your PATH.

## Extension Settings

This extension contributes the following settings:

- `commitcomposer.openaiApiKey`: Set to your OpenAI API key.
- `commitcomposer.modelName`: Set to the name of the OpenAI model to use. Default is `gpt-3.5-turbo`.

## Known Issues

- The best performing model is `gpt-4` but as it isn't generally available, the default is `gpt-3.5-turbo`.
- The context length of both models is 8000 tokens, which is smaller than large diffs.
- The OpenAI API is not free; using GPT-4, a commit draft costs a few cents.
- The drafts are not reliably good, and often fail to express the reasoning behind simple drafts. Always review the commit message before committing.
- Presently the extension only supports English.

## Release Notes

### 0.1.0

Initial release of Commit Composer.

# [Reddark (fork)](https://reddark.io/)
A website to watch subreddits go dark in realtime. Fork of the [repository by Tanza3D](https://github.com/Tanza3D/reddark).

## Subreddits
Reddark pulls the list of participating subreddits from the [r/ModCoord wiki](https://reddit.com/r/ModCoord/wiki/index). If you are the moderator of a sub that is going dark and that is not displayed on Reddark, you can [message the r/ModCoord moderators](https://reddit.com/message/compose?to=/r/ModCoord) to request that the subreddit is added to the wikipage.

## Features
If you have an idea for a feature you would like to see, please [submit an issue](https://github.com/username-is-required/reddark/issues/new?title=idea:%20[your%20idea%20here]) with the details!

## Bugs
There is currently one known bug with this fork of Reddark:

1) Ocasionally, something in the script (thought to be something in `./requests.js`) will hang, causing no more requests to the Reddit API to be sent. (This issue is being tracked in [#117](https://github.com/username-is-required/reddark/issues/117))

If you encounter an problem that is not listed here, please [submit an issue](https://github.com/username-is-required/reddark/issues/new?title=issue:%20[issue%20description%20here]) with the details, and it will be looked into.

## Branch Structure
There are two main branches that are used in this repository: `main` and `digital-ocean`. `main` is intended to be the 'front-page' of the repository (and the branch that can be easiest cloned to run locally), while `digital-ocean` is linked to the live version of the app and so contains some small differences that allow it to run on that platform.

If submitting a pull request, please submit it with `main` as the base branch, rather than `digital-ocean`.

## Technologies
This is using Express to host the frontend and Socket.io to serve data. Requests to Reddit are sent via the `/api/info.json` endpoint, which is used to get the statuses of 100 subreddits at a time.

The [main Reddark repository](https://github.com/tanza3d/reddark) was based on the [original work of D4llo](https://github.com/D4llo/Reddark).

## License
This repository is licensed under the [GNU Affero General Public License v3.0](https://github.com/username-is-required/reddark/blob/main/LICENSE).

# [Reddark (fork)](https://reddark-digitalocean-7lhfr.ondigitalocean.app)
A website to watch subreddits go dark in realtime. Fork of the repository by [Tanza3D](https://github.com/Tanza3D).

## Running
To run this fork, the following enviromnent variables must be set:

 - `PORT`
 - `INTERVAL_BETWEEN_REQUESTS`
 - `UPDATE_INTERVAL`
 - `LIST_REFRESH_INTERVAL`
 - `URL`

## Subreddits
Reddark pulls the list of participating subreddits from the [threads on r/ModCoord](https://reddit.com/r/ModCoord/comments/1401qw5/incomplete_and_growing_list_of_participating/). If you are the moderator of a sub that is going dark and that is not displayed on Reddark, you can [message the r/ModCoord moderators](https://reddit.com/message/compose?to=/r/ModCoord) to request that the subreddit is added to the relevant thread.

## Technologies
This is using Express to host the frontend and Socket.io to serve data. Quite simple code, and not too hard to get your head around.
This is based on the [Original work of D4llo](https://github.com/D4llo/Reddark) with permission.

# n8n-nodes-clipugc

[![npm version](https://img.shields.io/npm/v/n8n-nodes-clipugc.svg)](https://www.npmjs.com/package/n8n-nodes-clipugc)

This is an n8n community node. It lets you use [ClipUGC](https://clipugc.com) in your n8n workflows.

ClipUGC makes short vertical UGC videos for mobile apps. An AI influencer reacts in a silent clip, your app screen recording plays after it, and a hook line sits on top as text. The same AI influencer keeps the same face in every clip.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/n8n-community-license/) workflow automation platform.

[Installation](#installation) ·
[Credentials](#credentials) ·
[Operations](#operations) ·
[Usage](#usage) ·
[Example workflows](#example-workflows) ·
[Credits](#credits) ·
[Messages you can get](#messages-you-can-get) ·
[Compatibility](#compatibility) ·
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-clipugc`.

## Credentials

You need a ClipUGC account on the Professional or Business plan. API keys do not work on other plans.

1. In ClipUGC open **Dashboard**, then **API Keys**, and create a key.
2. In n8n create a credential of type **ClipUGC API**.
3. Paste the key into **API Key**. Leave **Base URL** as it is.
4. Click **Test**. n8n tells you if the key is wrong or if the plan has no API access.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| AI Influencer | Create | Designs a new AI influencer from a description and starts the first look. |
| AI Influencer | Get Many | Lists your own AI influencers, the public cast, or both. |
| Look | Generate | Makes a new picture of an AI influencer with the same face. |
| Look | Get | Returns a look and its status. |
| Clip | Create | Turns a look into a 5 or 10 second silent vertical clip. |
| Clip | Get | Returns a clip and its status. |
| Finished Video | Create | Puts a clip, your app screen recording and a hook line together. |
| Finished Video | Get | Returns a finished video, its status and a download link. |
| Account | Get Credits | Returns your credit balance and the current prices. |

A look is a picture of an AI influencer. A clip animates one look. Every operation that returns a look also returns `look_id`, which is what **Clip > Create** needs.

## Usage

### The shortest path to a video

1. **AI Influencer > Get Many** with **Show** set to **Public Cast** and **Limit** 1. You get a public AI influencer and its `look_id`. You do not have to create your own first.
2. **Clip > Create** with that `look_id` and a prompt. Describe movement and expression only. The clip has no speech.
3. **Finished Video > Create** with the clip `id`, a link to your app screen recording and a hook line.
4. Read `download_url` from the output. The link works for 30 minutes.

### Waiting

ClipUGC answers a create call at once and does the work in the background. Each create operation has **Wait for Completion**. It is on by default.

- On: the node checks the status every **Check Every (Seconds)** and returns when the status is `completed`. It stops waiting after **Max Wait (Seconds)**. The generation keeps running on ClipUGC, so nothing is lost.
- Off: the node returns the ID at once with status `pending`. Check later with the matching **Get** operation. In a workflow you can loop with a Wait node and an IF node until `status` is `completed`. The example workflow built with HTTP Request nodes shows this pattern.

### The app screen recording

**Finished Video > Create** takes the recording in two ways:

- **From a Link**: a direct link to an MP4 or MOV. n8n must be able to download it without a login.
- **From a Previous Node**: a file that an earlier node loaded, for example from Google Drive or an HTTP Request node.

The node uploads the file to ClipUGC for you. Files up to 100 MB are accepted.

### Using your own AI influencer

**AI Influencer > Create** takes a description of 10 to 1000 characters. With **Wait for Completion** on, the output has a `look_id` that is ready to use. Plans limit how many AI influencers you can create per month. Using the public cast is not limited.

## Example workflows

Both files are in the [`examples`](examples) folder. Import one with **Import from File** in n8n.

| File | What it shows |
|---|---|
| `clipugc-ugc-video-node.json` | One finished video with this node: pick a public AI influencer, create the clip, create the finished video, output the download link. |
| `clipugc-ugc-video-http.json` | The same result with plain HTTP Request nodes and a Header Auth credential. No community node needed. It also shows the Wait and IF polling pattern. |

## Credits

ClipUGC charges credits per generation. Prices are set by ClipUGC and can change. **Account > Get Credits** returns the current ones, so read them there.

A call that is refused is not charged. A generation that ends as `failed` gets its credits back.

## Messages you can get

| Message | What it means | What to do |
|---|---|---|
| Your ClipUGC plan does not include API access | HTTP 402, ClipUGC code 1002. The key belongs to an account without the Professional or Business plan. | Upgrade the plan. The key works again by itself. |
| Not enough ClipUGC credits | ClipUGC code 1003. The account can not pay for this step. Nothing was charged. | Add credits, or wait for the monthly credits. |
| ClipUGC could not make this clip (or look, or finished video) | The generation ended with status `failed`. Its credits were returned. | Change the prompt or run it again. |
| The clip is still not ready after N seconds | **Max Wait** is over. The generation keeps running. | Raise **Max Wait**, or read it later with **Get**. |
| ClipUGC did not accept the API key | The key is wrong or was deleted. | Paste the key again in the credential. |
| Too many requests for this ClipUGC key | The rate limit for the key was reached. | Wait as long as the message says. |

With **Continue On Fail** on, the node puts the message into `error` and `description` on the item and goes on.

## Compatibility

Built and tested with n8n 2.48.4. It uses n8n nodes API version 1.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [ClipUGC API reference](https://clipugc.com/docs/api)
- [ClipUGC](https://clipugc.com)

## Development

```bash
npm install
npm run lint
npm run build
npm test
npm run dev
```

`npm run dev` starts a local n8n with this node loaded. A release is a version tag: GitHub Actions publishes it to npm with a provenance statement.

## License

[MIT](LICENSE)

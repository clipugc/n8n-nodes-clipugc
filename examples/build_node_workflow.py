#!/usr/bin/env python3
"""Builds examples/clipugc-ugc-video-node.json. Usage: build_node_workflow.py <out.json>"""
import json
import sys
import uuid

CRED = {"clipUgcApi": {"id": "REPLACE_ME", "name": "ClipUGC account"}}
nodes, conns = [], {}


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "clipugc-n8n-node/" + name))


def add(name, type_, version, params, pos, **extra):
    nodes.append({"parameters": params, "id": nid(name), "name": name, "type": type_,
                  "typeVersion": version, "position": pos, **extra})


def link(src, dst):
    conns.setdefault(src, {"main": [[]]})["main"][0].append({"node": dst, "type": "main", "index": 0})


def clipugc(name, params, pos):
    add(name, "n8n-nodes-clipugc.clipUgc", 1, params, pos, credentials=CRED)


S = "$('Your settings').first().json"
Y = 300

add("Run workflow", "n8n-nodes-base.manualTrigger", 1, {}, [0, Y])
add("Your settings", "n8n-nodes-base.set", 3.4, {"assignments": {"assignments": [
    {"id": str(uuid.uuid4()), "name": k, "value": v, "type": "string"} for k, v in [
        ("clip_prompt", "Looks down at the phone, eyes go wide in surprise, then looks up at the camera and smiles"),
        ("app_recording_url", "https://example.com/your-app-screen-recording.mp4"),
        ("hook_text", "POV: you found the app that plans your whole week"),
    ]]}, "options": {}}, [220, Y])
clipugc("Get credits and prices", {"resource": "account", "operation": "getCredits"}, [440, Y])
clipugc("Pick a public AI influencer", {
    "resource": "aiInfluencer", "operation": "getAll", "scope": "discover", "returnAll": False, "limit": 1,
}, [660, Y])
clipugc("Create the clip", {
    "resource": "clip", "operation": "create",
    "lookId": "={{ $json.look_id }}",
    "prompt": "={{ " + S + ".clip_prompt }}",
    "duration": 5, "waitForCompletion": True, "pollInterval": 10, "maxWait": 600,
}, [880, Y])
clipugc("Create the finished video", {
    "resource": "finishedVideo", "operation": "create",
    "clipId": "={{ $json.id }}",
    "recordingSource": "url",
    "recordingUrl": "={{ " + S + ".app_recording_url }}",
    "hookText": "={{ " + S + ".hook_text }}",
    "waitForCompletion": True, "pollInterval": 10, "maxWait": 600,
}, [1100, Y])
add("Result", "n8n-nodes-base.set", 3.4, {"assignments": {"assignments": [
    {"id": str(uuid.uuid4()), "name": "download_url", "value": "={{ $json.download_url }}", "type": "string"},
    {"id": str(uuid.uuid4()), "name": "finished_video_id", "value": "={{ $json.id }}", "type": "number"},
    {"id": str(uuid.uuid4()), "name": "clip_id", "value": "={{ $json.character_video_id }}", "type": "number"},
    {"id": str(uuid.uuid4()), "name": "credits_before", "value": "={{ $('Get credits and prices').first().json.balance }}", "type": "number"},
    {"id": str(uuid.uuid4()), "name": "clip_cost", "value": "={{ $('Get credits and prices').first().json.costs.clip }}", "type": "number"},
]}, "options": {}}, [1320, Y])

order = ["Run workflow", "Your settings", "Get credits and prices", "Pick a public AI influencer",
         "Create the clip", "Create the finished video", "Result"]
for a, b in zip(order, order[1:]):
    link(a, b)

add("Note: start here", "n8n-nodes-base.stickyNote", 1, {"width": 560, "height": 420, "content": """## ClipUGC: UGC video with an AI influencer

Makes one finished vertical UGC video for your app: a 5 second silent reaction clip of an AI influencer, then your app screen recording, with your hook line on top.

**Set up**
1. Install the community node `n8n-nodes-clipugc` (Settings, then Community Nodes).
2. Create a ClipUGC API key: ClipUGC Dashboard, then API Keys. API keys need the Professional or Business plan.
3. Create a **ClipUGC API** credential in n8n, paste the key, and select it in the four ClipUGC nodes.
4. Fill in **Your settings**: the clip prompt, a direct link to your screen recording, and the hook line.
5. Click **Execute workflow**. **Result** holds `download_url`. The link works for 30 minutes.

The two create nodes wait until ClipUGC is done. They check every 10 seconds and stop waiting after 10 minutes.
"""}, [-60, -180])
add("Note: own AI influencer", "n8n-nodes-base.stickyNote", 1, {"width": 420, "height": 260, "color": 5, "content": """## Want your own AI influencer?

Swap **Pick a public AI influencer** for a ClipUGC node set to **AI Influencer > Create** and describe the person. It also returns `look_id`, so the next node works as it is.

To reuse the same AI influencer in every run, keep the `look_id` and type it into **Create the clip**.
"""}, [560, -60])
add("Note: messages", "n8n-nodes-base.stickyNote", 1, {"width": 560, "height": 300, "color": 3, "content": """## If a ClipUGC node stops

**Your ClipUGC plan does not include API access** (HTTP 402, code 1002): the key belongs to an account without the Professional or Business plan.

**Not enough ClipUGC credits** (code 1003): the account can not pay for this step. Nothing was charged.

**ClipUGC could not make this clip**: the generation ended as failed. Its credits were returned. Change the prompt or run again.
"""}, [860, 500])

with open(sys.argv[1], "w") as f:
    json.dump({"name": "ClipUGC: UGC video with an AI influencer (ClipUGC node)", "nodes": nodes,
               "connections": conns, "pinData": {}, "settings": {"executionOrder": "v1"},
               "meta": {"templateCredsSetupCompleted": False}, "tags": []}, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"{sys.argv[1]}: {len(nodes)} nodes")
